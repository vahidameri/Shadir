/**
 * Madar (مدار) — Google Sheets backend (Apps Script Web App)
 *
 * Setup:
 *   1. Create an empty Google Sheet → Extensions → Apps Script → paste this file.
 *   2. Run `setup` once (authorize when asked). It creates every tab with headers
 *      and an admin key in the "Users" tab.
 *   3. Optional: run `seedDemo` to load sample rows.
 *   4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *   5. Paste the /exec URL and your key into the dashboard's Settings page.
 *   6. Optional: run `installDailyDigest` for a 7:30 morning email digest.
 *
 * Security: people sign in with Google; the email is matched to the Team tab, whose `access`
 * column decides what they receive: super (program manager, everything + back office),
 * exec (the CPTO), head (unit leads), member (only their own work). Legacy roles:
 *   admin  — read + write + manage
 *   editor — read + write
 *   viewer — read only (leadership)
 */

var MADAR_VERSION = '2.6.0'; // shown on the login page and by diagnose()

var SCHEMA = {
  Projects: ['id', 'code', 'name', 'description', 'category', 'owner', 'client', 'liaison', 'liaison_contact', 'status', 'priority', 'phase', 'start_date', 'end_date', 'progress', 'health_override', 'objective', 'paused_at', 'pause_reason', 'delivery_day', 'last_delivery', 'archived', 'archived_at', 'links', 'team', 'kind', 'batch'],
  Scope: ['id', 'project_id', 'item', 'type', 'status', 'change_note', 'date'],
  Milestones: ['id', 'project_id', 'title', 'planned_date', 'actual_date', 'status', 'owner', 'weight'],
  // sprints belong to a team; committed_points is fixed when the sprint starts, completed_points when it closes
  Sprints: ['id', 'project_id', 'name', 'start_date', 'end_date', 'goal', 'committed_points', 'completed_points', 'status', 'team', 'started_at', 'closed_at', 'retro', 'carried', 'batch'],
  Tasks: ['id', 'project_id', 'sprint_id', 'title', 'description', 'assignee', 'reporter', 'status', 'priority', 'due_date', 'points', 'tags', 'created_at', 'completed_at', 'track', 'depends_on', 'meeting_id', 'private', 'deadline', 'handoff_date', 'test_date', 'follow_date', 'area', 'collaborators', 'watchers', 'notify', 'start_date', 'estimate', 'checklist', 'assigned_at', 'flag', 'blocked_reason', 'blocked_by', 'blocked_since', 'updated_at', 'link', 'requested_by', 'kr_id', 'issue_type', 'key', 'plan_id', 'ext_id', 'batch'],
  // owner = who is chasing; follow-ups are personal
  FollowUps: ['id', 'project_id', 'subject', 'person', 'channel', 'due_date', 'status', 'priority', 'notes', 'created_at', 'done_at', 'owner', 'waiting_for', 'link', 'last_ping', 'ping_count', 'ext_id', 'batch'],
  Risks: ['id', 'project_id', 'title', 'type', 'probability', 'impact', 'owner', 'mitigation', 'status', 'due_date'],
  // capacity = % of one full-time person (100 = full-time, 600 = a team of six)
  // email = the Google account used to sign in; tasks_private = '1' hides this person's tasks (e.g. the CEO)
  // role = job title code: ceo | cpo | cto | pgm | pm | pd | gd (free text also works)
  // access: super | exec | head | member. key = optional personal key (sign-in without Google).
  // username = sign-in name (blank = made from name_en, e.g. vahid.ameri); one shared team password
  Team: ['id', 'name', 'name_en', 'username', 'role', 'email', 'team', 'track', 'capacity', 'photo', 'tasks_private', 'phone', 'access', 'active', 'key', 'batch'],
  // start_date / end_date are optional; blank = open-ended
  // quarter = planning quarter (e.g. 1405-Q3); blank = every quarter
  Allocations: ['id', 'member_id', 'project_id', 'percent', 'start_date', 'end_date', 'quarter'],
  Updates: ['id', 'project_id', 'week_date', 'author', 'health', 'summary', 'done', 'next', 'blockers'],
  // Comments on tasks / follow-ups / projects. created_at is "YYYY-MM-DD HH:mm".
  Comments: ['id', 'entity', 'entity_id', 'author', 'body', 'created_at', 'batch'],
  // Delivery plan. baseline_date = first committed date (kept when target_date moves → slippage).
  Deliverables: ['id', 'project_id', 'title', 'track', 'owner', 'target_date', 'baseline_date', 'delivered_date', 'status', 'confidence', 'notes'],
  // Weekly meetings. series: portfolio | product | tech | project | other. attendees comma-separated; decisions one per line.
  // guests: people outside the department — emails or names from Contacts, comma or line separated
  Meetings: ['id', 'series', 'title', 'project_id', 'date', 'time', 'facilitator', 'attendees', 'status', 'notes', 'decisions', 'gcal_id', 'meet_url', 'duration', 'purpose', 'items', 'checklist', 'sprint_id', 'guests'],
  // Uploaded files live in a Drive folder; this tab is the index.
  Files: ['id', 'entity', 'entity_id', 'name', 'mime', 'size', 'url', 'uploaded_by', 'created_at'],
  // Shared settings (automation switches: auto.<id> = on/off). id = key.
  Config: ['id', 'value'],
  // Contracts — only ever sent to super (program manager) and exec (CEO)
  Contracts: ['id', 'project_id', 'title', 'counterparty', 'number', 'kind', 'status', 'start_date', 'end_date', 'value', 'notes'],
  // Hand-offs between sides (product / design / tech): one row per pass; a return + resend opens the next round.
  Handoffs: ['id', 'task_id', 'project_id', 'title', 'from_side', 'to_side', 'from_person', 'to_person', 'status', 'round', 'sent_at', 'due_date', 'responded_at', 'note', 'reply'],
  // Weekly delivery log: one row per project per week (status delivered | partial | skipped).
  Deliveries: ['id', 'project_id', 'week', 'date', 'status', 'note', 'by'],
  // field-level change log for tasks and follow-ups (written by history_, never by the app directly)
  History: ['id', 'entity', 'entity_id', 'field', 'from', 'to', 'by', 'at', 'batch'],
  // people who ask, mention or are chased (inside or outside the department); tier sets SLA and priority
  Contacts: ['id', 'name', 'name_en', 'title', 'org', 'tier', 'email', 'phone', 'notes', 'active', 'batch'],
  // Mizito: one row per Mizito task the CPTO / PgM was mentioned on; re-mentions go to MizitoMentions
  // source = agent when the Mizito agent brought it; review = new (waiting for a look) | ignored.
  // mz_* columns mirror the task in Mizito and are written by the agent only.
  Mizito: ['id', 'mz_key', 'link', 'title', 'description', 'docs', 'asked_by', 'mentioned', 'category', 'action', 'status', 'priority_override', 'override_reason', 'urgent', 'assigned_to', 'due_date', 'received_at', 'last_mention_at', 'last_mention_by', 'outcome', 'notes', 'created_at', 'updated_at', 'closed_at', 'ext_id', 'batch',
    'source', 'review', 'mz_state', 'mz_done_at', 'mz_done_by', 'mz_progress', 'mz_project', 'mz_owner', 'mz_assignees', 'mz_labels', 'mz_checklist', 'mz_deadline', 'mz_last_by', 'mz_last_at', 'mz_sig', 'synced_at', 'mz_change', 'mz_changed_at', 'mz_first', 'mz_link_ok', 'mz_chat', 'mz_again', 'flag'],
  // account = whose Mizito the agent read it in; mz_id = the mention's id there, mz_comment = the comment that mentioned
  MizitoMentions: ['id', 'item_id', 'by', 'at', 'note', 'status', 'batch', 'mz_id', 'account', 'mz_comment'],
  // the conversation on a Mizito task, as the agent read it (one row per Mizito comment)
  MizitoComments: ['id', 'item_id', 'by', 'at', 'body', 'mentions', 'reply_to', 'files', 'batch'],
  // the cartable: items the PgM puts in front of the CPTO (or either for themselves) to act on.
  // box = daily | weekly; period = the day, or the week's first day; status = draft | sent | done | returned
  Cartable: ['id', 'owner', 'box', 'period', 'from', 'entity', 'entity_id', 'title', 'ask', 'kind', 'priority', 'due_date', 'status', 'response', 'sent_at', 'done_at', 'sort', 'created_at', 'batch'],
  // a person's own to-do notes on their desk (nobody else receives them)
  Todos: ['id', 'owner', 'text', 'done', 'day', 'created_at', 'sort', 'batch'],
  // quarterly OKRs per team: objectives, and key results under them (kind: number | percent | done)
  Objectives: ['id', 'team', 'quarter', 'title', 'description', 'owner', 'sort', 'batch'],
  // weight = share of the team's quarter (a team's key results add up to 100); mizito_link = where it is discussed
  KeyResults: ['id', 'objective_id', 'title', 'owner', 'kind', 'start', 'target', 'current', 'unit', 'confidence', 'project_id', 'note', 'updated_at', 'weight', 'mizito_link', 'batch'],
  // one row per key-result check-in: the value, confidence and note at that moment (the trend)
  Checkins: ['id', 'kr_id', 'at', 'value', 'confidence', 'note', 'by', 'batch'],
  // roadmap items for teams that plan without sprints; baseline_end = first committed end (slippage)
  Plans: ['id', 'team', 'title', 'kind', 'project_id', 'kr_id', 'owner', 'start_date', 'end_date', 'baseline_end', 'status', 'progress', 'confidence', 'note', 'link', 'updated_at', 'batch'],
  // product KPIs: latest value against a target; previous = the value before the last update
  Kpis: ['id', 'project_id', 'name', 'unit', 'direction', 'target', 'current', 'previous', 'updated_at', 'note', 'batch'],
};

var USERS_SHEET = 'Users';
var USERS_HEADERS = ['key', 'name', 'email', 'role', 'active'];
var LOG_SHEET = 'AuditLog';
var DATE_COLS = ['start_date', 'end_date', 'planned_date', 'actual_date', 'due_date', 'created_at', 'completed_at', 'done_at', 'week_date', 'date', 'target_date', 'baseline_date', 'delivered_date', 'time', 'deadline', 'handoff_date', 'test_date', 'follow_date', 'last_delivery', 'archived_at', 'sent_at', 'responded_at', 'week', 'assigned_at', 'blocked_since', 'updated_at', 'received_at', 'last_mention_at', 'closed_at', 'at', 'last_ping', 'started_at', 'baseline_end', 'mz_done_at', 'mz_deadline', 'mz_last_at', 'synced_at', 'mz_changed_at', 'period', 'sent_at'];

// --------------------------------------------------------------------------
// HTTP entry points
// --------------------------------------------------------------------------

function doGet(e) {
  // No action → serve the app itself (Index.html). Everything runs on Google: no other hosting.
  if (!e.parameter.action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Madar')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  try {
    var user = auth_(e.parameter);
    var action = e.parameter.action || 'all';
    var me = { name: user.name, role: user.role, email: user.email, access: user.access };
    if (action === 'all') {
      // nothing written since this person's last read: say so instead of sending everything again
      var ver = cacheVer_();
      if (e.parameter.v && e.parameter.v === ver) return json_({ ok: true, user: me, same: true, ver: ver, version: MADAR_VERSION });
      // d=1: only the parts this person does not have yet (h = what they have, part → fingerprint)
      if (e.parameter.d) {
        var have = {};
        try { have = JSON.parse(e.parameter.h || '{}') || {}; } catch (eh) {}
        var all = readAll_(user);
        try {
          var delta = deltaOut_(all, have);
          return json_({ ok: true, user: me, delta: true, data: delta.data, h: delta.h, ver: ver, version: MADAR_VERSION });
        } catch (eDelta) {
          return json_({ ok: true, user: me, data: all, ver: ver, version: MADAR_VERSION });
        }
      }
      return json_({ ok: true, user: me, data: readAll_(user), ver: ver, version: MADAR_VERSION });
    }
    if (action === 'ping') return json_({ ok: true, user: me, version: MADAR_VERSION });
    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    // email-code sign-in (no Google account needed) — before auth, these are how you get a session
    if (body.action === 'otpSend') return json_(otpSend_(body.email));
    if (body.action === 'otpVerify') return json_(otpVerify_(body.email, body.code));
    if (body.action === 'otpLink') return json_(otpLink_(body.token));
    if (body.action === 'pwLogin') return json_(pwLogin_(body.username, body.password));
    if (body.action === 'otpLogout') return json_(otpLogout_(body.session));
    // the Mizito agent (a browser extension) signs in with its own key, bound to one person
    // the old Chrome extension (mizito-agent) is retired: nothing reaches Mizito data but an import
    // made by hand in the app. An extension still installed gets this answer and adds nothing.
    if (body.action === 'mzHello' || body.action === 'mzIngest') {
      return json_({ ok: false, error: 'ایجنت میزیتو دیگر استفاده نمی‌شود؛ افزونه را از chrome://extensions حذف کنید' });
    }
    var user = auth_(body);
    if (body.action === 'mzAgentKey' || body.action === 'mzAgentRevoke') {
      if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند کلید ایجنت بسازد');
      lock.waitLock(20000);
      return json_({ ok: true, row: body.action === 'mzAgentKey' ? mzAgentKey_(body.name) : mzAgentRevoke_(body.name) });
    }
    if (body.action === 'mzImport') {
      if (user.access !== 'super' && user.access !== 'exec') throw new Error('فقط مدیر برنامه و CPTO میزیتو را ایمپورت می‌کنند');
      lock.waitLock(30000);
      return json_({ ok: true, row: mzImport_(body, user) });
    }
    if (body.action === 'mzLinks') {
      if (user.access !== 'super' && user.access !== 'exec') throw new Error('فقط مدیر برنامه و CPTO');
      lock.waitLock(30000);
      return json_({ ok: true, row: mzLinks_(body.links || [], user) });
    }
    if (body.action === 'mzDedupe') {
      if (user.access !== 'super' && user.access !== 'exec') throw new Error('فقط مدیر برنامه و CPTO');
      lock.waitLock(30000);
      return json_({ ok: true, row: mzDedupe_(!!body.dry) });
    }
    if (body.action === 'mzReset') {
      if (user.access !== 'super') throw new Error('فقط مدیر برنامه به این بخش دسترسی دارد');
      lock.waitLock(30000);
      return json_({ ok: true, row: mzReset_(user) });
    }
    if (body.action === 'setTeamPassword') {
      if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند رمز را تغییر دهد');
      return json_(setTeamPassword_(body.password));
    }
    if (user.role === 'viewer') throw new Error('دسترسی شما فقط مشاهده است');
    lock.waitLock(20000);
    var result;
    if (body.action === 'upload') result = upload_(body, user);
    else if (body.action === 'bulk') result = bulk_(body.sheet, body.rows, user);
    else if (body.action === 'undoBatch') result = undoBatch_(body.batch, user);
    else if (body.action === 'readSheet') result = readOtherSheet_(body.url, body.tab, user);
    else if (body.action === 'mailTask') result = mailTask_(body.id, user);
    else if (body.action === 'mailMinutes') result = mailMinutes_(body.meeting_id, user);
    else if (body.action === 'mailCartable') result = mailCartable_(body.owner, body.box, body.period, user);
    else if (body.action === 'syncMeeting') result = syncMeeting_(body.meeting_id, user);
    else {
      if (!SCHEMA[body.sheet]) throw new Error('Unknown sheet: ' + body.sheet);
            guardPrivate_(body.sheet, body.action === 'delete' ? { id: body.id } : body.row, user);
      guardWrite_(body.sheet, body.action === 'delete' ? existingRow_(body.sheet, body.id) : body.row, user);
      if (body.sheet === 'History') throw new Error('سابقه‌ی تغییرات فقط خودکار ثبت می‌شود');
      var logged = !!HISTORY_FIELDS[body.sheet];
      var before = (body.action === 'upsert' && (body.sheet === 'Tasks' || logged)) ? existingRow_(body.sheet, body.row.id) : null;
      if (body.action === 'upsert') {
        if (body.sheet === 'Mizito' && before) body.row = mzKeepAgentFields_(before, body.row);
        result = upsert_(body.sheet, body.row, user);
        // the log and the assignment email must never turn a saved row into an error
        if (logged) { try { history_(body.sheet, before, body.row, user); } catch (eLog) {} }
        if (body.sheet === 'Tasks') { try { mailAssigned_(before, body.row, user); } catch (eMail) {} }
      } else if (body.action === 'delete') {
        result = delete_(body.sheet, body.id, user);
        if (logged) { try { historyRows_([{ entity: body.sheet, entity_id: body.id, field: '_deleted', from: '', to: '' }], user); } catch (eLog2) {} }
      }
      else throw new Error('Unknown action: ' + body.action);
    }
    return json_({ ok: true, row: result });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * Called from the app (google.script.run) in the "Execute as: User accessing the web app"
 * deployment. Hands the signed-in person their own Google token plus the data API address.
 * The token is the user's, so it can never act as anyone else; if this deployment were
 * misconfigured to run as the owner for other visitors, we refuse.
 */
function atlasSession() {
  var active = Session.getActiveUser().getEmail();
  var effective = Session.getEffectiveUser().getEmail();
  var apiUrl = PropertiesService.getScriptProperties().getProperty('API_URL') || '';
  // Username + password is always offered first. When the page already runs as the visitor's own
  // Google account (the app link, or the owner on the data link), their token is offered as the
  // "Continue with Google" option — never anyone else's.
  var appUrl = '';
  try { appUrl = setting_('app.google_url', ''); } catch (e) {} // the app link can't read the sheet
  var out = { otp: true, apiUrl: apiUrl || ScriptApp.getService().getUrl(), appUrl: appUrl };
  if (active && active === effective) out.google = { token: ScriptApp.getOAuthToken(), email: active };
  return out;
}

// --------------------------------------------------------------------------
// Email-code sign-in: the email carries a one-click sign-in link (15 min, single use) and a 6-digit
// code (10 min, 5 tries); either gives a 90-day session for that device.
// Sessions are stored hashed in script properties; signing out revokes the session.
// --------------------------------------------------------------------------

var SESSION_DAYS = 90;

function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

/** "Forgot password": a username or an email → that person's email (blank if none). */
function loginEmail_(id) {
  id = String(id || '').trim().toLowerCase();
  var m = (rawAll_().Team || []).filter(function (x) {
    return String(x.active).toLowerCase() !== 'false' && (usernameOf_(x) === id || String(x.email || '').toLowerCase() === id);
  })[0];
  return m ? String(m.email || '').toLowerCase() : '';
}

function otpSend_(id) {
  var key = String(id || '').trim().toLowerCase();
  if (!key) throw new Error('نام کاربری یا ایمیل را وارد کنید');
  var email = loginEmail_(key);
  var c = CacheService.getScriptCache();
  if (c.get('otp.rl.' + key)) throw new Error('یک دقیقه صبر کنید و دوباره امتحان کنید');
  c.put('otp.rl.' + key, '1', 60);
  var m = email ? (rawAll_().Team || []).filter(function (x) { return String(x.email || '').toLowerCase() === email && String(x.active).toLowerCase() !== 'false'; })[0] : null;
  // the reply is the same whether or not the email is on the team
  if (m) {
    var code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000);
    while (code.length < 6) code = '0' + code;
    c.put('otp.' + email, JSON.stringify({ h: hash_(code), n: 0 }), 600);
    var link = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    c.put('otpl.' + hash_(link), email, 900);
    var url = (PropertiesService.getScriptProperties().getProperty('API_URL') || ScriptApp.getService().getUrl()) + '?login=' + link;
    MailApp.sendEmail({
      to: email,
      subject: 'ورود به مدار · کد ' + code,
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9;color:#111">' + m.name + ' عزیز، سلام' +
        '<div style="margin:18px 0"><a href="' + url + '" style="background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;display:inline-block">ورود به مدار</a></div>' +
        'یا این کد را در صفحه‌ی ورود بزنید:' +
        '<div style="font:700 28px/1.4 monospace;letter-spacing:6px;margin:8px 0" dir="ltr">' + code + '</div>' +
        '<span style="color:#666;font-size:12px">لینک ۱۵ دقیقه و کد ۱۰ دقیقه اعتبار دارد. اگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید.</span></div>',
    });
  }
  return { ok: true };
}

function otpVerify_(id, code) {
  var email = loginEmail_(id) || String(id || '').trim().toLowerCase();
  var c = CacheService.getScriptCache();
  var raw = c.get('otp.' + email);
  if (!raw) throw new Error('کد منقضی شده؛ دوباره کد بگیرید');
  var o = JSON.parse(raw);
  if (o.n >= 5) {
    c.remove('otp.' + email);
    throw new Error('تلاش‌های زیاد؛ دوباره کد بگیرید');
  }
  if (hash_(String(code || '').replace(/\D/g, '')) !== o.h) {
    o.n++;
    c.put('otp.' + email, JSON.stringify(o), 600);
    throw new Error('کد اشتباه است');
  }
  c.remove('otp.' + email);
  return newSession_(email);
}

/** One-click sign-in from the link in the email (single use). */
function otpLink_(link) {
  var c = CacheService.getScriptCache();
  var k = 'otpl.' + hash_(link || '');
  var email = link ? c.get(k) : null;
  if (!email) throw new Error('لینک ورود منقضی شده؛ دوباره کد بگیرید');
  c.remove(k);
  c.remove('otp.' + email);
  return newSession_(email);
}

// --------------------------------------------------------------------------
// Username + shared team password. The password is stored salted and hashed in script
// properties; 8 wrong tries lock that username for 10 minutes.
// --------------------------------------------------------------------------

var DEFAULT_TEAM_PASSWORD = 'Madar@1405'; // change it in the back office (settings → team password)

function usernameOf_(m) {
  var u = String(m.username || '').trim().toLowerCase();
  if (u) return u;
  var n = String(m.name_en || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return n || String(m.email || '').split('@')[0].toLowerCase();
}

function pwHash_(pw) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PW_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('PW_SALT', salt);
  }
  return hash_(salt + '|' + pw);
}

function setTeamPassword_(pw) {
  pw = String(pw || '');
  if (pw.length < 6) throw new Error('رمز باید حداقل ۶ کاراکتر باشد');
  PropertiesService.getScriptProperties().setProperty('TEAM_PASSWORD', pwHash_(pw));
  return { ok: true };
}

function pwLogin_(username, password) {
  var u = String(username || '').trim().toLowerCase();
  if (!u || !password) throw new Error('نام کاربری و رمز را وارد کنید');
  var c = CacheService.getScriptCache();
  var tries = Number(c.get('pw.n.' + u) || 0);
  if (tries >= 8) throw new Error('تلاش زیاد؛ ۱۰ دقیقه بعد دوباره امتحان کنید');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TEAM_PASSWORD')) setTeamPassword_(DEFAULT_TEAM_PASSWORD);
  var m = (rawAll_().Team || []).filter(function (x) {
    return String(x.active).toLowerCase() !== 'false' && (usernameOf_(x) === u || String(x.email || '').toLowerCase() === u);
  })[0];
  if (!m || pwHash_(String(password)) !== props.getProperty('TEAM_PASSWORD')) {
    c.put('pw.n.' + u, String(tries + 1), 600);
    throw new Error('نام کاربری یا رمز اشتباه است');
  }
  c.remove('pw.n.' + u);
  return newSession_(String(m.email || '').toLowerCase(), m.id);
}

/** Fills empty usernames in the Team tab (vahid.ameri…) so they are visible in the Sheet too. */
function fillUsernames_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Team');
  if (!sh || sh.getLastRow() < 2) return;
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var col = h.indexOf('username');
  if (col < 0) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
  var out = rows.map(function (r) {
    var o = {};
    h.forEach(function (k, i) { o[k] = r[i]; });
    return [usernameOf_(o)];
  });
  sh.getRange(2, col + 1, out.length, 1).setValues(out);
}

function newSession_(email, memberId) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + SESSION_DAYS * 86400000;
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess.') !== 0) return;
    try { if (JSON.parse(all[k]).x < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
  props.setProperty('sess.' + hash_(token), JSON.stringify({ e: email, m: memberId || '', x: exp }));
  return { ok: true, session: token, email: email, exp: exp };
}

function otpLogout_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess.' + hash_(token));
  return { ok: true };
}

/** The person behind a session ({e: email, m: member id}), or an error if unknown or expired. */
function sessionInfo_(token) {
  var k = 'sess.' + hash_(token);
  var raw = PropertiesService.getScriptProperties().getProperty(k);
  if (!raw) throw new Error('نشست منقضی شده؛ دوباره وارد شوید');
  var s = JSON.parse(raw);
  if (s.x < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(k);
    throw new Error('نشست منقضی شده؛ دوباره وارد شوید');
  }
  return s;
}

/** Run once after the first deployment: save API_URL in Script Properties, then Run setApiUrl (or call setApiUrl('…/exec')). */
function setApiUrl(url) {
  var props = PropertiesService.getScriptProperties();
  // run from the editor's Run button (no argument): takes the API_URL already saved in Script Properties
  url = String(url || props.getProperty('API_URL') || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) throw new Error('اول در Project Settings ← Script Properties مقدار API_URL را برابر لینک انتشار Madar Team (پایان /exec) بگذارید، بعد setApiUrl را Run کنید.');
  props.setProperty('API_URL', url);
  // Only accept Google tokens issued to this script project (learned from your own token).
  var info = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + ScriptApp.getOAuthToken()).getContentText());
  var allowed = (props.getProperty('GOOGLE_CLIENT_ID') || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (info.azp && allowed.indexOf(info.azp) === -1) allowed.push(info.azp);
  props.setProperty('GOOGLE_CLIENT_ID', allowed.join(','));
  Logger.log('API_URL = ' + url + '\nGOOGLE_CLIENT_ID = ' + allowed.join(','));
}

// --------------------------------------------------------------------------
// Data access
// --------------------------------------------------------------------------

function readAll_(user) {
  var out = JSON.parse(JSON.stringify(rawAll_(true)));
  delete out[USERS_SHEET];
  return user ? applyPrivacy_(out, user) : out;
}

// --------------------------------------------------------------------------
// Speed: each tab is cached on its own (gzip, in chunks) and re-read only after a write to it.
// A write bumps that tab's version (and the global one the app checks), so the next read takes
// only the changed tab from the Sheet and the rest from the cache. A manual edit bumps the edited
// tab (onEdit); setup, demo data and undo bump the generation, which drops every cached tab.
// --------------------------------------------------------------------------

var CACHE_TTL = 600;
var RAW_ = null; // per-request memo

function stamp_() {
  return Date.now() + '.' + Math.random().toString(36).slice(2, 7);
}

function cacheVer_() {
  var c = CacheService.getScriptCache();
  var v = c.get('atlas.ver');
  if (!v) {
    v = stamp_();
    c.put('atlas.ver', v, 21600);
  }
  return v;
}

/** name: the tab that changed; none = everything (setup, demo data, undo). */
function bumpVersion_(name) {
  RAW_ = null;
  RAW_FULL_ = false;
  if (name) delete RAW_LOADED_[name];
  else { RAW_LOADED_ = {}; RAW_DATA_ = {}; }
  var c = CacheService.getScriptCache();
  var put = { 'atlas.ver': stamp_() };
  if (name) put['atlas.sv.' + name] = stamp_();
  else put['atlas.gen'] = stamp_();
  c.putAll(put, 21600);
}

/**
 * The data, tab by tab. eager = every tab now (reading everything for the app); otherwise each tab is
 * loaded the first time it is used, so a save — which looks at a few tabs — never unpacks the rest.
 */
function rawAll_(eager) {
  if (RAW_ && (!eager || RAW_FULL_)) return RAW_;
  var names = Object.keys(SCHEMA).concat([USERS_SHEET]);
  if (eager) {
    var got = rawLoad_(names.filter(function (n) { return !RAW_LOADED_[n]; }));
    names.forEach(function (n) { if (!RAW_LOADED_[n]) { RAW_LOADED_[n] = 1; RAW_DATA_[n] = got[n]; } });
    var all = {};
    names.forEach(function (n) { all[n] = RAW_DATA_[n]; });
    RAW_ = all;
    RAW_FULL_ = true;
    return RAW_;
  }
  var lazy = {};
  names.forEach(function (n) {
    Object.defineProperty(lazy, n, {
      enumerable: true,
      configurable: true,
      get: function () {
        if (!RAW_LOADED_[n]) { RAW_DATA_[n] = rawLoad_([n])[n]; RAW_LOADED_[n] = 1; }
        return RAW_DATA_[n];
      },
      set: function (v) { RAW_DATA_[n] = v; RAW_LOADED_[n] = 1; },
    });
  });
  RAW_ = lazy;
  RAW_FULL_ = false;
  return RAW_;
}
var RAW_FULL_ = false;
var RAW_LOADED_ = {};
var RAW_DATA_ = {};

/** Loads the named tabs: from the cache (one batch of calls), else from the Sheet (and caches them). */
function rawLoad_(names) {
  if (!names.length) return {};
  var c = CacheService.getScriptCache();
  // generation and per-tab versions; a missing one gets a fresh stamp so an old copy is never reused
  var vk = ['atlas.gen'].concat(names.map(function (n) { return 'atlas.sv.' + n; }));
  var vs = c.getAll(vk);
  var fresh = {};
  vk.forEach(function (k) { if (!vs[k]) fresh[k] = vs[k] = stamp_(); });
  if (Object.keys(fresh).length) c.putAll(fresh, 21600);
  var base = {};
  names.forEach(function (n) { base[n] = 'atlas.s.' + n + '.' + vs['atlas.gen'] + '.' + vs['atlas.sv.' + n]; });
  var counts = c.getAll(names.map(function (n) { return base[n]; }));
  var keys = [];
  names.forEach(function (n) {
    var k = Number(counts[base[n]] || 0);
    for (var i = 0; i < k; i++) keys.push(base[n] + '.' + i);
  });
  var parts = keys.length ? c.getAll(keys) : {};
  var out = {};
  var ss = null;
  var store = {};
  names.forEach(function (n) {
    var k = Number(counts[base[n]] || 0);
    if (k) {
      var s = '';
      for (var i = 0; i < k && s !== null; i++) s = parts[base[n] + '.' + i] ? s + parts[base[n] + '.' + i] : null;
      if (s !== null) {
        try {
          out[n] = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString());
          return;
        } catch (e) {}
      }
    }
    ss = ss || SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(n);
    out[n] = sh ? readSheet_(sh) : [];
    try {
      var z = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(out[n]), 'application/json')).getBytes());
      var size = 90000;
      var count = Math.ceil(z.length / size) || 1;
      if (count <= 30) {
        for (var j = 0; j < count; j++) store[base[n] + '.' + j] = z.slice(j * size, (j + 1) * size);
        store[base[n]] = String(count);
      }
    } catch (e) {}
  });
  var sk = Object.keys(store);
  for (var b = 0; b < sk.length; b += 50) {
    var part = {};
    sk.slice(b, b + 50).forEach(function (k) { part[k] = store[k]; });
    try { c.putAll(part, CACHE_TTL); } catch (e) {}
  }
  return out;
}

// --------------------------------------------------------------------------
// Sending only what changed. What a person sees is cut into parts: one per tab, and the tabs that
// only grow (the change log, comments, Mizito's conversation) one part per month. Each part has a
// fingerprint of exactly what this person receives; the app says which fingerprints it holds and
// gets back only the parts that differ — after a save, usually one tab and this month's log.
// The same rule is in src/lib/delta.ts.
// --------------------------------------------------------------------------
var PARTS_ = { History: 'at', Comments: 'created_at', MizitoComments: 'at', MizitoMentions: 'at' };

function partsOf_(data) {
  var parts = {};
  Object.keys(data).forEach(function (name) {
    var rows = data[name] || [];
    var field = PARTS_[name];
    if (!field) { parts[name] = rows; return; }
    rows.forEach(function (r) { var k = name + '|' + String(r[field] || '').slice(0, 7); (parts[k] = parts[k] || []).push(r); });
  });
  return parts;
}

function fingerprint_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)).slice(0, 12);
}

function deltaOut_(data, have) {
  var parts = partsOf_(data), out = {}, h = {};
  Object.keys(parts).forEach(function (k) {
    var f = fingerprint_(JSON.stringify(parts[k]));
    h[k] = f;
    if (have[k] !== f) out[k] = parts[k];
  });
  return { data: out, h: h };
}

/** Simple trigger: a manual edit in the Sheet invalidates that tab's cache. */
function onEdit(e) {
  try {
    var n = e && e.range ? e.range.getSheet().getName() : '';
    bumpVersion_(n && (SCHEMA[n] || n === USERS_SHEET) ? n : undefined);
  } catch (err) {}
}

// --------------------------------------------------------------------------
// Privacy — private tasks (and everything attached to them) never leave the sheet
// for anyone except the assignee and the person who created the task.
// --------------------------------------------------------------------------

function privateOwners_(team) {
  var set = {};
  team.forEach(function (m) { if (String(m.tasks_private) === '1') set[m.name] = true; });
  return set;
}

function canSeeTask_(t, user, owners) {
  var priv = String(t.private) === '1' || owners[lead_(t)];
  return !priv || listed_(t.assignee, user.name) || t.reporter === user.name || listed_(t.collaborators, user.name);
}

var LEADERS = { super: 1, exec: 1, head: 1 };

function listed_(s, me) { return String(s || '').split(',').map(function (x) { return x.trim(); }).indexOf(me) !== -1; }
/** Task.assignee holds one or more names, comma-separated (the first leads). */
function assignees_(t) { return String(t.assignee || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function lead_(t) { return assignees_(t)[0] || ''; }
/** Mirrors isMine in src/lib/access.ts: doer, creator, sharer or tracker. */
function isMine_(t, me) { return !!me && (listed_(t.assignee, me) || t.reporter === me || listed_(t.collaborators, me) || listed_(t.watchers, me)); }

function applyPrivacy_(data, user) {
  var owners = privateOwners_(data.Team || []);
  data.Team = (data.Team || []).map(function (m) { var c = {}; for (var k in m) if (k !== 'key') c[k] = m[k]; return c; });
  var hidden = {};
  data.Tasks = (data.Tasks || []).filter(function (t) {
    var ok = canSeeTask_(t, user, owners);
    if (!ok) hidden[t.id] = true;
    return ok;
  });
  data.Comments = (data.Comments || []).filter(function (c) { return !(c.entity === 'Tasks' && hidden[c.entity_id]); });
  data.Files = (data.Files || []).filter(function (f) { return !(f.entity === 'Tasks' && hidden[f.entity_id]); });
  // to-do notes are personal; a cartable draft is seen only by whoever is writing it
  data.Todos = (data.Todos || []).filter(function (t) { return t.owner === user.name; });
  data.Cartable = (data.Cartable || []).filter(function (c) { return c.status !== 'draft' || c.from === user.name; });
  var out = applyScope_(data, user, owners);
  // the log of a task or follow-up travels only with the row itself
  var seen = { Tasks: {}, FollowUps: {}, Mizito: {}, KeyResults: {}, Kpis: {}, Plans: {} };
  (out.Tasks || []).forEach(function (t) { seen.Tasks[t.id] = 1; });
  (out.FollowUps || []).forEach(function (f) { seen.FollowUps[f.id] = 1; });
  (out.Mizito || []).forEach(function (m) { seen.Mizito[m.id] = 1; });
  (out.KeyResults || []).forEach(function (k) { seen.KeyResults[k.id] = 1; });
  (out.Kpis || []).forEach(function (k) { seen.Kpis[k.id] = 1; });
  (out.Plans || []).forEach(function (k) { seen.Plans[k.id] = 1; });
  out.History = (out.History || []).filter(function (h) { return seen[h.entity] && seen[h.entity][h.entity_id]; });
  return out;
}

/** Access scoping (mirrors src/lib/access.ts). */
function applyScope_(data, user, owners) {
  var a = user.access || 'member';
  var me = user.name;
  // follow-ups are personal; super/exec see everyone's except another private person's
  data.FollowUps = (data.FollowUps || []).filter(function (f) {
    if (a === 'super' || a === 'exec') return !f.owner || f.owner === me || !owners[f.owner];
    return f.owner === me || f.person === me;
  });
  if (a !== 'super' && a !== 'exec') {
    // the Mizito queue and the people registry are for the CPTO and the PgM only
    data.Mizito = [];
    data.MizitoMentions = [];
    data.MizitoComments = [];
    data.Cartable = [];
    data.Contacts = [];
    data.Contracts = [];
    data.Files = data.Files.filter(function (f) { return f.entity !== 'Contracts' && f.entity !== 'Mizito'; });
  }
  if (LEADERS[a]) return data;
  var ok = allowedProjects_(data, me);
  var inP = function (pid) { return !!pid && !!ok[pid]; };
  var listed = function (s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).indexOf(me) !== -1; };
  ['Milestones', 'Scope', 'Risks', 'Updates', 'Deliverables'].forEach(function (k) { data[k] = (data[k] || []).filter(function (r) { return inP(r.project_id); }); });
  // sprints belong to a team, not a project
  data.Sprints = (data.Sprints || []).filter(function (r) { return !r.project_id || inP(r.project_id); });
  var myId = ((data.Team || []).filter(function (m) { return m.name === me; })[0] || {}).id;
  data.Allocations = (data.Allocations || []).filter(function (r) { return inP(r.project_id) || r.member_id === myId; });
  data.Projects = (data.Projects || []).filter(function (p) { return ok[p.id]; });
  // own + shared tasks, plus every task of a project this person leads
  var led = {};
  data.Projects.forEach(function (p) { if (p.owner === me) led[p.id] = 1; });
  // a hand-off assigned to me brings its task along so it can be accepted or returned
  var forMe = function (h) { return h.to_person === me; };
  var handed = {};
  (data.Handoffs || []).forEach(function (h) { if (forMe(h)) handed[h.task_id] = 1; });
  data.Tasks = data.Tasks.filter(function (t) { return isMine_(t, me) || !!led[t.project_id] || !!handed[t.id]; });
  data.Meetings = (data.Meetings || []).filter(function (m) { return listed(m.attendees) || m.facilitator === me || inP(m.project_id); });
  var vis = { Tasks: {}, Projects: ok, Meetings: {}, FollowUps: {}, Deliverables: {}, Risks: {}, Team: {} };
  data.Tasks.forEach(function (t) { vis.Tasks[t.id] = 1; });
  data.Meetings.forEach(function (m) { vis.Meetings[m.id] = 1; });
  data.FollowUps.forEach(function (f) { vis.FollowUps[f.id] = 1; });
  data.Deliverables.forEach(function (d) { vis.Deliverables[d.id] = 1; });
  data.Risks.forEach(function (r) { vis.Risks[r.id] = 1; });
  data.Team.forEach(function (m) { vis.Team[m.id] = 1; });
  // plans, key results and sprints are not scoped, so neither are their notes and documents
  ['Plans', 'KeyResults', 'Sprints'].forEach(function (k) { vis[k] = {}; (data[k] || []).forEach(function (r) { vis[k][r.id] = 1; }); });
  data.Handoffs = (data.Handoffs || []).filter(function (h) { return h.from_person === me || forMe(h) || vis.Tasks[h.task_id] || (!h.task_id && inP(h.project_id)); });
  data.Deliveries = (data.Deliveries || []).filter(function (x) { return inP(x.project_id); });
  data.Comments = data.Comments.filter(function (c) { return vis[c.entity] && vis[c.entity][c.entity_id]; });
  data.Files = data.Files.filter(function (f) { return vis[f.entity] && vis[f.entity][f.entity_id]; });
  data.Contracts = [];
  return data;
}

function allowedProjects_(data, me) {
  var ok = {};
  var myId = ((data.Team || []).filter(function (m) { return m.name === me; })[0] || {}).id;
  (data.Projects || []).forEach(function (p) { if (p.owner === me) ok[p.id] = 1; });
  (data.Allocations || []).forEach(function (a) { if (a.member_id === myId) ok[a.project_id] = 1; });
  (data.Tasks || []).forEach(function (t) { if (t.project_id && listed_(t.assignee, me)) ok[t.project_id] = 1; });
  (data.Deliverables || []).forEach(function (d) { if (d.owner === me) ok[d.project_id] = 1; });
  return ok;
}

/** What each access level may write. */
function guardWrite_(sheet, row, user) {
  var a = user.access || 'member';
  if (sheet === 'Config' && a !== 'super') throw new Error('فقط مدیر برنامه می‌تواند تنظیمات را تغییر دهد');
  if (sheet === 'Contracts' && a !== 'super' && a !== 'exec') throw new Error('دسترسی به قراردادها ندارید');
  if ((sheet === 'Mizito' || sheet === 'MizitoMentions' || sheet === 'MizitoComments' || sheet === 'Contacts' || sheet === 'Cartable') && a !== 'super' && a !== 'exec') throw new Error('این بخش فقط برای CPTO و مدیر برنامه است');
  if (sheet === 'Cartable') {
    var cb = existingRow_('Cartable', row && row.id);
    if (cb && cb.status === 'draft' && cb.from !== user.name) throw new Error('این پیش‌نویس مال شخص دیگری است');
  }
  if (sheet === 'Todos') {
    var mine = existingRow_('Todos', row && row.id);
    if ((mine && mine.owner !== user.name) || (row && row.owner && row.owner !== user.name)) throw new Error('یادداشت‌های هر کس فقط برای خودش است');
  }
  if (sheet === 'Team' && a !== 'super') {
    // anyone may update their own photo / phone; only the program manager manages people
    var cur = rawAll_().Team.filter(function (m) { return String(m.id) === String(row.id); })[0];
    if (!cur || cur.name !== user.name) throw new Error('فقط مدیر برنامه می‌تواند افراد را تعریف یا ویرایش کند');
    ['access', 'active', 'key', 'tasks_private', 'email', 'name'].forEach(function (k) { row[k] = cur[k]; });
  }
  if (LEADERS[a] || !row) return;
  // a project lead records the weekly delivery of their own projects
  if (sheet === 'Deliveries') {
    var lead = existingRow_('Projects', row.project_id);
    if (!lead || lead.owner !== user.name) throw new Error('فقط مدیر همین پروژه می‌تواند تحویل هفتگی را ثبت کند');
    row.by = user.name;
    return;
  }
  // hand-offs are logged by the app when a task is re-assigned to another unit: a member may log one
  // for a task they work on, and nobody but leadership edits the log afterwards
  if (sheet === 'Handoffs') {
    if (existingRow_('Handoffs', row.id)) throw new Error('سابقه‌ی تحویل قابل ویرایش نیست');
    var task = existingRow_('Tasks', row.task_id);
    // the person who handed it over (the previous assignee) or anyone working on it may log the pass
    if (!task || !(row.from_person === user.name || isMine_(task, user.name) || handedTo_(row.task_id, user.name))) throw new Error('این تسک مربوط به شما نیست');
    return;
  }
  // a project lead keeps their project's links (stage, Figma…) up to date, nothing else
  if (sheet === 'Projects') {
    var curP = existingRow_('Projects', row.id);
    if (curP && curP.owner === user.name) {
      var links = row.links;
      Object.keys(curP).forEach(function (k) { row[k] = curP[k]; });
      row.links = links;
      return;
    }
  }
  if (sheet === 'Projects' || sheet === 'Allocations') throw new Error('فقط لیدرشیپ می‌تواند پروژه و تخصیص را تغییر دهد');
  if (sheet === 'FollowUps' && row.owner && row.owner !== user.name) throw new Error('پیگیری دیگران را نمی‌توانید تغییر دهید');
  if (sheet === 'FollowUps') row.owner = user.name;
  if (row.project_id) {
    var ok = allowedProjects_(rawAll_(), user.name);
    // an existing task is judged by what is stored, so nobody can claim a task by adding themselves
    var own = sheet === 'Tasks' && (isMine_(existingRow_('Tasks', row.id) || row, user.name) || handedTo_(row.id, user.name));
    if (!ok[row.project_id] && !own) throw new Error('این پروژه در دسترس شما نیست');
  }
}

/** A hand-off on this task is assigned to this person (they may take the task on). */
function handedTo_(taskId, name) {
  return (rawAll_().Handoffs || []).some(function (h) { return String(h.task_id) === String(taskId) && h.to_person === name; });
}

/** Stops edits to a private task (or its comments/files) by someone who can't see it. */
function guardPrivate_(sheet, row, user) {
  if (!row) return;
  var taskId = sheet === 'Tasks' ? row.id : (sheet === 'Comments' || sheet === 'Files') && row.entity === 'Tasks' ? row.entity_id : '';
  if (!taskId) return;
  var owners = privateOwners_(rawAll_().Team);
  var tasks = rawAll_().Tasks;
  for (var i = 0; i < tasks.length; i++) {
    if (String(tasks[i].id) === String(taskId) && !canSeeTask_(tasks[i], user, owners)) throw new Error('این تسک خصوصی است');
  }
}

function existingRow_(sheet, id) {
  return (rawAll_()[sheet] || []).filter(function (r) { return String(r.id) === String(id); })[0] || null;
}

function setting_(key, fallback) {
  var rows = rawAll_().Config || [];
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === key) return String(rows[i].value);
  return fallback;
}
// Every server automation sends email, so each one is off until the program manager switches it on
// (notifications live inside the app; email is a choice).
function automationOn_(id) { return setting_('auto.' + id, 'off') === 'on'; }

function readSheet_(sh) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(String);
  var tz = Session.getScriptTimeZone();
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row[0] === '' || row[0] === null) continue;
    var o = {};
    for (var c = 0; c < headers.length; c++) {
      var v = row[c];
      if (v instanceof Date) v = headers[c] === 'time' ? Utilities.formatDate(v, tz, 'HH:mm') : Utilities.formatDate(v, tz, v.getHours() || v.getMinutes() ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
      o[headers[c]] = v;
    }
    rows.push(o);
  }
  return rows;
}

function uniqueKey_(sh, headers, key) {
  var col = headers.indexOf('key');
  if (col === -1 || sh.getLastRow() < 2) return key;
  var keys = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  if (keys.indexOf(key) === -1) return key;
  var prefix = String(key).split('-')[0];
  var max = 0;
  keys.forEach(function (k) { var m = new RegExp('^' + prefix + '-(\\d+)$').exec(k); if (m) max = Math.max(max, Number(m[1])); });
  return prefix + '-' + (max + 1);
}

function upsert_(name, row, user) {
  if (!row || !row.id) throw new Error('row.id is required');
  var sh = ensureSheet_(name, SCHEMA[name]);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  // Add any new columns the client sends (forward compatible).
  Object.keys(row).forEach(function (k) {
    if (headers.indexOf(k) === -1) {
      sh.getRange(1, headers.length + 1).setValue(k);
      headers.push(k);
    }
  });
  // a new task's readable key (TECH-42) must be unique across every task, not just the ones its author can see
  if (name === 'Tasks' && row.key && findRow_(sh, row.id) <= 0) row.key = uniqueKey_(sh, headers, row.key);
  var values = headers.map(function (h) {
    var v = row[h];
    if (v === undefined || v === null) return '';
    // keep "10:00" as text so Sheets doesn't turn it into a 1899 date-time
    if (h === 'time' && v !== '') return "'" + v;
    // settings are always text ("0,1,2,3,4" must not become a number)
    if (name === 'Config' && h === 'value' && v !== '') return "'" + v;
    return v;
  });
  var idx = findRow_(sh, row.id);
  if (idx > 0) {
    sh.getRange(idx, 1, 1, headers.length).setValues([values]);
    log_(user, 'update', name, row.id);
    bumpVersion_(name);
  } else {
    sh.appendRow(values);
    log_(user, 'create', name, row.id);
    if (name === 'Comments') notifyMentions_(row, user);
    bumpVersion_(name);
  }
  return row;
}

function delete_(name, id, user) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return null;
  var idx = findRow_(sh, id);
  if (idx > 0) {
    sh.deleteRow(idx);
    log_(user, 'delete', name, id);
    bumpVersion_(name);
  }
  return { id: id };
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : -1;
}

// --------------------------------------------------------------------------
// Auth & audit
// --------------------------------------------------------------------------

/**
 * Run from the editor when the app can't load or save: tests the data address the app uses,
 * with a read (GET) and a write (POST). Both should answer JSON: {"ok":false,"error":"وارد نشده‌اید"}.
 */
function diagnose() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('API_URL') || '';
  Logger.log('نسخه‌ی Code.gs = ' + MADAR_VERSION);
  Logger.log('API_URL = ' + (url || '(خالی — setApiUrl اجرا نشده)'));
  Logger.log('GOOGLE_CLIENT_ID = ' + (props.getProperty('GOOGLE_CLIENT_ID') || '(خالی)'));
  // teammates only see "Continue with Google" when the Madar Google link is saved in the back office
  var g = setting_('app.google_url', '');
  Logger.log('لینک ورود با گوگل (app.google_url) = ' + (g || '(خالی — تیم دکمه‌ی «ورود با گوگل» را نمی‌بیند؛ بک‌آفیس ← تنظیمات)'));
  if (g && url && g.split('?')[0] === url.split('?')[0]) Logger.log('⚠ لینک ورود با گوگل همان لینک Madar Team است؛ باید لینک انتشار Madar Google باشد.');
  if (!url) return;
  var show = function (label, res) {
    var t = res.getContentText();
    var title = (t.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
    Logger.log(label + ' → ' + res.getResponseCode() + ' · ' + (t.trim().charAt(0) === '<' ? 'HTML: ' + (title || t.slice(0, 300)) : t.slice(0, 300)));
  };
  show('GET ', UrlFetchApp.fetch(url + '?action=ping', { muteHttpExceptions: true }));
  show('POST', UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'upsert', sheet: 'Config', row: { id: 'diagnose' } }), muteHttpExceptions: true }));
}

/**
 * Who is calling. Preferred: a Google access token from "Sign in with Google" — verified with
 * Google, then matched by email to the Users tab. Fallback: a personal key from the Users tab.
 */
function auth_(params) {
  var team = rawAll_().Team || [];
  var legacy = rawAll_()[USERS_SHEET] || [];
  var active = function (u) { return String(u.active).toLowerCase() !== 'false'; };
  var fromTeam = function (m) { return { name: m.name, email: String(m.email || '').toLowerCase(), access: m.access || 'member', role: 'editor' }; };
  // legacy Users rows: admin → super, viewer stays read-only
  var fromUsers = function (u) {
    var r = (u.role || 'viewer').toLowerCase();
    var m = team.filter(function (t) { return t.name === u.name; })[0];
    return { name: u.name, email: String(u.email || '').toLowerCase(), access: m && m.access ? m.access : r === 'admin' ? 'super' : 'member', role: r === 'viewer' ? 'viewer' : 'editor' };
  };
  var find = function (list, pred) { for (var i = 0; i < list.length; i++) if (active(list[i]) && pred(list[i])) return list[i]; return null; };
  if (params.session) {
    var si = sessionInfo_(params.session);
    var sm = si.m ? find(team, function (x) { return String(x.id) === String(si.m); }) : null;
    if (sm) return fromTeam(sm);
    if (!si.e) throw new Error('حساب شما غیرفعال شده است');
    params = { access_token: '', email_: si.e };
  }
  if (params.access_token || params.email_) {
    var email = params.email_ || googleEmail_(params.access_token);
    var m = find(team, function (x) { return String(x.email).toLowerCase() === email; });
    if (m) return fromTeam(m);
    var u = find(legacy, function (x) { return String(x.email).toLowerCase() === email; });
    if (u) return fromUsers(u);
    throw new Error('حساب ' + email + ' تعریف نشده است. از مدیر برنامه بخواهید شما را در بک‌آفیس اضافه کند.');
  }
  if (!params.token) throw new Error('وارد نشده‌اید');
  var k = find(team, function (x) { return x.key && String(x.key) === String(params.token); });
  if (k) return fromTeam(k);
  var lu = find(legacy, function (x) { return x.key && String(x.key) === String(params.token); });
  if (lu) return fromUsers(lu);
  throw new Error('کلید دسترسی نامعتبر است');
}

/** Verifies a Google access token (cached ~50 min) and returns the signed-in email. */
function googleEmail_(token) {
  var cache = CacheService.getScriptCache();
  var k = 'tok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(k);
  if (hit) return hit;
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('نشست گوگل منقضی شده؛ دوباره وارد شوید');
  var info = JSON.parse(res.getContentText());
  var clients = (PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (!clients.length) throw new Error('تنظیم ناقص: setApiUrl را یک بار اجرا کنید');
  if (clients.indexOf(info.aud) === -1 && clients.indexOf(info.azp) === -1) throw new Error('این توکن برای این برنامه صادر نشده است');
  if (!info.email || String(info.email_verified) !== 'true') throw new Error('ایمیل حساب گوگل تأیید نشده است');
  var email = String(info.email).toLowerCase();
  cache.put(k, email, Math.min(3000, Number(info.expires_in) || 3000));
  return email;
}

// --------------------------------------------------------------------------
// History — one row per changed field of a task or follow-up (mirrors src/lib/history.ts)
// --------------------------------------------------------------------------

var HISTORY_FIELDS = {
  Tasks: ['title', 'description', 'status', 'priority', 'assignee', 'due_date', 'assigned_at', 'flag', 'track', 'project_id', 'blocked_reason', 'blocked_by', 'link', 'requested_by', 'collaborators', 'watchers', 'private', 'deadline', 'kr_id', 'sprint_id', 'points', 'plan_id'],
  FollowUps: ['subject', 'person', 'status', 'due_date', 'priority', 'channel', 'notes', 'project_id', 'owner', 'waiting_for', 'link'],
  Mizito: ['title', 'status', 'asked_by', 'mentioned', 'category', 'action', 'priority_override', 'urgent', 'assigned_to', 'due_date', 'outcome', 'link', 'description'],
  KeyResults: ['current', 'confidence', 'target', 'title', 'owner', 'note', 'weight'],
  Kpis: ['current', 'target', 'name'],
  Plans: ['status', 'end_date', 'progress', 'confidence', 'note', 'owner', 'title', 'start_date'],
};

function clip_(v) { return String(v === undefined || v === null ? '' : v).slice(0, 300); }

function history_(sheet, before, row, user) {
  var fields = HISTORY_FIELDS[sheet];
  if (!fields || !row) return;
  if (!before) return historyRows_([{ entity: sheet, entity_id: row.id, field: '_created', from: '', to: clip_(row.status) }], user);
  var out = [];
  fields.forEach(function (f) {
    if (!(f in row)) return;
    var a = clip_(before[f]), b = clip_(row[f]);
    if (a !== b) out.push({ entity: sheet, entity_id: row.id, field: f, from: a, to: b });
  });
  historyRows_(out, user);
}

function historyRows_(rows, user) {
  if (!rows.length) return;
  var sh = ensureSheet_('History', SCHEMA.History);
  var at = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  // values are written as text so Sheets doesn't turn "1405" or "2026-10-19" into numbers or dates
  var t = function (v) { return v === '' ? '' : "'" + v; };
  var vals = rows.map(function (r, i) {
    return ['H' + Date.now().toString(36) + i, r.entity, r.entity_id, r.field, t(r.from), t(r.to), r.by || user.name, "'" + at];
  });
  sh.getRange(sh.getLastRow() + 1, 1, vals.length, SCHEMA.History.length).setValues(vals);
  bumpVersion_('History');
}

// --------------------------------------------------------------------------
// Import — the back office brings rows from old sheets in one go (program manager only).
// Every imported row carries a batch id, so a whole import can be taken back.
// --------------------------------------------------------------------------

var BULK_SHEETS = { Tasks: 1, FollowUps: 1, Mizito: 1, MizitoMentions: 1, MizitoComments: 1, Contacts: 1, Team: 1, Projects: 1, History: 1, Comments: 1, Allocations: 1, Objectives: 1, KeyResults: 1, Kpis: 1, Checkins: 1, Sprints: 1, Plans: 1 };

function bulk_(name, rows, user) {
  if (user.access !== 'super' && !(name === 'Mizito' && user.access === 'exec')) throw new Error('فقط مدیر برنامه می‌تواند ایمپورت کند');
  if (!BULK_SHEETS[name]) throw new Error('این تب قابل ایمپورت نیست: ' + name);
  rows = (rows || []).filter(function (r) { return r && r.id; });
  if (!rows.length) return { count: 0 };
  writeRows_(name, rows);
  log_(user, 'import ' + rows.length, name, rows[0].batch || '');
  bumpVersion_(name);
  return { count: rows.length };
}

/** Writes whole rows in one go: rows already in the sheet are updated in place, the rest appended. */
function writeRows_(name, rows) {
  // one row per id (the last one wins)
  var byId = {};
  (rows || []).forEach(function (r) { if (r && r.id) byId[String(r.id)] = r; });
  rows = Object.keys(byId).map(function (k) { return byId[k]; });
  if (!rows.length) return;
  var sh = ensureSheet_(name, SCHEMA[name]);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (headers.indexOf(k) === -1) { sh.getRange(1, headers.length + 1).setValue(k); headers.push(k); }
    });
  });
  var ids = {};
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (v, i) { ids[String(v[0])] = i + 2; });
  var text = function (h, v) {
    if (v === undefined || v === null || v === '') return '';
    if (DATE_COLS.indexOf(h) !== -1 || h === 'value') return "'" + v;
    // text that starts like a formula (=, +, -, @) stays text
    if (typeof v === 'string' && /^[=+\-@]/.test(v) && isNaN(Number(v))) return "'" + v;
    // what the agent brings is text ("0912…", "1405", "100" stay as written)
    if (typeof v === 'string' && MZ_TEXT_SHEETS[name]) return "'" + v;
    return v;
  };
  var fresh = [];
  rows.forEach(function (r) {
    var vals = headers.map(function (h) { return text(h, r[h]); });
    var at = ids[String(r.id)];
    if (at) sh.getRange(at, 1, 1, headers.length).setValues([vals]);
    else fresh.push(vals);
  });
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, headers.length).setValues(fresh);
  bumpVersion_(name);
}

function undoBatch_(batch, user) {
  if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند ایمپورت را برگرداند');
  if (!batch) throw new Error('batch لازم است');
  var ss = SpreadsheetApp.getActive();
  var removed = 0;
  Object.keys(BULK_SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = headers.indexOf('batch');
    if (col === -1) return;
    var vals = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]) === String(batch)) { sh.deleteRow(i + 2); removed++; }
    }
  });
  log_(user, 'undo import', 'batch', batch);
  bumpVersion_();
  return { removed: removed };
}

/** Reads a tab of another Google Sheet (the program manager must have access to it). Links in cells come back as URLs. */
function readOtherSheet_(url, tab, user) {
  if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند از شیت دیگر بخواند');
  var ss;
  try { ss = SpreadsheetApp.openByUrl(String(url || '').trim()); } catch (e) { throw new Error('شیت باز نشد. لینک را بررسی کنید و مطمئن شوید حساب صاحب اسکریپت به آن دسترسی دارد.'); }
  var tabs = ss.getSheets().map(function (x) { return x.getName(); });
  var sh = tab ? ss.getSheetByName(tab) : null;
  if (!sh) return { tabs: tabs, title: ss.getName(), rows: [] };
  var range = sh.getDataRange();
  var values = range.getDisplayValues();
  var rich = range.getRichTextValues();
  var formulas = range.getFormulas();
  var rows = values.map(function (row, i) {
    return row.map(function (v, j) {
      var link = '';
      try { link = rich[i][j] && rich[i][j].getLinkUrl(); } catch (e) {}
      if (!link) {
        var fm = (formulas[i][j] || '').match(/HYPERLINK\(\s*"([^"]+)"/i);
        if (fm) link = fm[1];
      }
      return link && link !== v ? v + '\u0001' + link : v;
    });
  });
  return { tabs: tabs, title: ss.getName(), rows: rows.slice(0, 3000) };
}

function log_(user, action, sheet, id) {
  var sh = ensureSheet_(LOG_SHEET, ['time', 'user', 'action', 'sheet', 'id']);
  sh.appendRow([new Date(), user.name, action, sheet, id]);
}

/** Emails team members @mentioned in a new comment (Team tab must have their email). */
function notifyMentions_(c, user) {
  try {
    var team = rawAll_().Team || [];
    team.forEach(function (m) {
      if (m.email && m.name && String(c.body).indexOf('@' + m.name) !== -1) {
        MailApp.sendEmail({
          to: m.email,
          subject: 'Madar · ' + user.name + ' mentioned you',
          htmlBody: '<div dir="auto" style="font-family:Tahoma,sans-serif;line-height:1.8"><b>' + user.name + '</b>:<br>' + String(c.body).replace(/</g, '&lt;') + '</div>',
        });
      }
    });
  } catch (e) {
    Logger.log('mention mail failed: ' + e);
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// --------------------------------------------------------------------------
// Setup helpers (run manually from the editor)
// --------------------------------------------------------------------------

function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#eef2ff');
    sh.setFrozenRows(1);
    // Keep dates as plain ISO text so the client always receives YYYY-MM-DD.
    headers.forEach(function (h, i) {
      if (DATE_COLS.indexOf(h) !== -1) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sh;
}

function setup() {
  // retired ways of reading Mizito (the extension's keys, the server reader's trigger) are switched off
  try {
    PropertiesService.getScriptProperties().deleteProperty('MZ_AGENTS');
    PropertiesService.getScriptProperties().deleteProperty('MZ_TOKENS');
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mzServerSyncAll') ScriptApp.deleteTrigger(t); });
  } catch (eOld) {}
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ensureSheet_(name, SCHEMA[name]);
    // Upgrade older sheets: append any columns added since they were created.
    var have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    SCHEMA[name].forEach(function (h) {
      if (have.indexOf(h) === -1) {
        sh.getRange(1, have.length + 1).setValue(h).setFontWeight('bold').setBackground('#eef2ff');
        have.push(h);
      }
    });
  });
  ensureSheet_(LOG_SHEET, ['time', 'user', 'action', 'sheet', 'id']);
  var ss = SpreadsheetApp.getActive();
  var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('برگه۱');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);

  // The person running setup becomes the super admin (program manager).
  var team = ss.getSheetByName('Team');
  if (team.getLastRow() < 2) {
    var key = newKey_();
    var me = Session.getEffectiveUser().getEmail();
    upsert_('Team', { id: 'm1', name: 'وحید عامری', name_en: 'Vahid Ameri', role: 'pgm', email: me, team: 'pmo', capacity: 100, access: 'super', active: 'true', key: key }, { name: 'setup' });
    // the CPTO: the email is entered in the back office (People → edit), then they can sign in
    upsert_('Team', { id: 'm2', name: 'جلیل علیزاده', name_en: 'Jalil Alizadeh', role: 'cpto', email: '', team: 'leadership', capacity: 100, access: 'exec', active: 'true' }, { name: 'setup' });
    safeAlert_('راه‌اندازی انجام شد. شما (' + me + ') مدیر برنامه با دسترسی کامل هستید.\nCPTO (جلیل علیزاده) هم تعریف شد؛ ایمیل گوگلش را از بک‌آفیس ← دپارتمان و دسترسی وارد کنید.\n\nکلید پشتیبان (برای ورود بدون گوگل):\n' + key);
    Logger.log('Admin key: ' + key);
  }
  fillUsernames_();
  if (!PropertiesService.getScriptProperties().getProperty('TEAM_PASSWORD')) {
    setTeamPassword_(DEFAULT_TEAM_PASSWORD);
    safeAlert_('رمز عبور تیم: ' + DEFAULT_TEAM_PASSWORD + '\nنام کاربری هر نفر در تب Team (ستون username) است.\nرمز را از بک‌آفیس ← تنظیمات عوض کنید.');
  }
  bumpVersion_();
}

/** Adds a person from the editor: addUser('نام', 'name@noyanet.com', 'member'). Easier: use the back office in the app. */
function addUser(name, email, access) {
  var id = 'M-' + Utilities.getUuid().slice(0, 6);
  upsert_('Team', { id: id, name: name, email: email || '', access: access || 'member', active: 'true', capacity: 100 }, { name: 'editor' });
  Logger.log(name + ' → ' + id);
  return id;
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 24);
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/** Adds a custom menu in the Sheet for non-technical users. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Madar')
    .addItem('راه‌اندازی تب‌ها', 'setup')
    .addItem('عیب‌یابی اتصال', 'diagnose')
    .addItem('افزودن کاربر جدید…', 'promptAddUser')
    .addItem('ارسال خلاصه‌ی روزانه (همین حالا)', 'sendDailyDigest')
    .addItem('فعال‌سازی ایمیل روزانه', 'installDailyDigest')
    .addItem('نصب همه‌ی اتوماسیون‌ها', 'installAutomations')
    .addToUi();
}

function promptAddUser() {
  var ui = SpreadsheetApp.getUi();
  var n = ui.prompt('نام کاربر').getResponseText();
  if (!n) return;
  var em = ui.prompt('ایمیل').getResponseText();
  var r = ui.prompt('دسترسی: super / exec / head / member').getResponseText() || 'member';
  addUser(n, em, r);
  ui.alert(n + ' اضافه شد و می‌تواند با ' + em + ' وارد شود.');
}

// --------------------------------------------------------------------------
// Daily digest email — the "assistant" pushes your day to your inbox
// --------------------------------------------------------------------------

function installDailyDigest() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(7).nearMinute(30).create();
  safeAlert_('ایمیل خلاصه‌ی روزانه هر روز حدود ساعت ۷:۳۰ ارسال می‌شود.');
}

/** Open Mizito items that are urgent or past their SLA (mirrors src/lib/mizito.ts, simplified). */
function mizitoHot_(data) {
  var parse = function (k, d) { try { var v = JSON.parse(setting_(k, '')); return Array.isArray(v) && v.length ? v : d; } catch (e) { return d; } };
  var statuses = parse('mz.statuses', [{ id: 'needs_action', cat: 'open' }, { id: 'in_progress', cat: 'open' }, { id: 'awaiting', cat: 'waiting' }, { id: 'blocked', cat: 'blocked' }, { id: 'done', cat: 'done' }, { id: 'cancelled', cat: 'cancelled' }]);
  var tiers = parse('mz.tiers', [{ id: 'executive', sla: 4 }, { id: 'deputy', sla: 24 }, { id: 'manager', sla: 48 }, { id: 'standard', sla: 72 }]);
  var cat = function (id) { var x = statuses.filter(function (s) { return s.id === id; })[0]; return x ? x.cat : 'open'; };
  var tierOf = function (name) {
    var c = (data.Contacts || []).filter(function (x) { return x.name === name; })[0];
    return tiers.filter(function (t) { return c && t.id === c.tier; })[0] || tiers[tiers.length - 1];
  };
  var now = Date.now();
  return (data.Mizito || []).filter(function (m) { return cat(m.status) !== 'done' && cat(m.status) !== 'cancelled'; }).map(function (m) {
    var t = tierOf(m.asked_by);
    var last = new Date(String(m.last_mention_at || m.received_at || m.created_at).replace(' ', 'T')).getTime();
    var hours = last ? (now - last) / 3600000 : 0;
    var breached = cat(m.status) === 'open' && t && hours > Number(t.sla || 72);
    var why = [String(m.urgent) === '1' ? 'فوری' : '', breached ? Math.round(hours - t.sla) + ' ساعت عبور از SLA' : ''].filter(String).join(' · ');
    return { title: m.title, asked_by: m.asked_by, link: m.link, why: why, hot: !!why };
  }).filter(function (x) { return x.hot; });
}

function sendDailyDigest() {
  if (!automationOn_('daily_digest')) return;
  // the digest goes to the program manager: scoped as super, so the CEO's private items stay out
  var all = readAll_();
  var pm = (all.Team || []).filter(function (m) { return m.access === 'super'; })[0] || {};
  var data = applyPrivacy_(all, { name: pm.name || '', access: 'super' });
  var gone = archivedSet_(data);
  ['Tasks', 'FollowUps', 'Milestones'].forEach(function (k) { data[k] = (data[k] || []).filter(function (r) { return !gone[r.project_id]; }); });
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var pname = {};
  data.Projects.forEach(function (p) { pname[p.id] = p.name; });

  var shut = function (t) { return t.status === 'done' || t.status === 'cancelled'; };
  var overdueTasks = data.Tasks.filter(function (t) { return !shut(t) && t.due_date && t.due_date < today; });
  var todayTasks = data.Tasks.filter(function (t) { return !shut(t) && t.due_date === today; });
  var blocked = data.Tasks.filter(function (t) { return t.status === 'blocked'; });
  var mz = mizitoHot_(data);
  var fus = data.FollowUps.filter(function (f) { return f.status !== 'done' && f.due_date && f.due_date <= today; });
  var ms = data.Milestones.filter(function (m) { return m.status !== 'done' && m.planned_date && m.planned_date < today; });

  // running sprints, so the CPTO sees the tech team's state without opening the app
  var sprints = (data.Sprints || []).filter(function (x) { return x.status === 'active'; }).map(function (x) {
    var ts = data.Tasks.filter(function (t) { return t.sprint_id === x.id && t.status !== 'cancelled'; });
    var p = function (list) { return list.reduce(function (n, t) { return n + (Number(t.points) || 0); }, 0); };
    var left = Math.max(0, Math.round((new Date(x.end_date) - new Date(today)) / 86400000));
    return { name: x.name, goal: x.goal, done: p(ts.filter(function (t) { return t.status === 'done'; })), total: p(ts), blocked: ts.filter(function (t) { return t.status === 'blocked'; }).length, left: left };
  });

  var li = function (s) { return '<li style="margin:4px 0">' + s + '</li>'; };
  var sec = function (title, color, items) {
    if (!items.length) return '';
    return '<h3 style="color:' + color + ';margin:18px 0 6px">' + title + ' (' + items.length + ')</h3><ul style="padding-right:18px;margin:0">' + items.join('') + '</ul>';
  };

  var html = '<div dir="rtl" style="font-family:Tahoma,Vazirmatn,sans-serif;font-size:14px;line-height:1.8;color:#111">' +
    '<h2 style="margin:0 0 8px">خلاصه‌ی امروز — مدار</h2>' +
    sec('میزیتو: فوری یا عبور از SLA', '#c4314b', mz.map(function (m) { return li('<b>' + esc_(m.title) + '</b> — ' + esc_(m.asked_by || '') + (m.why ? ' · ' + m.why : '') + (m.link ? ' · <a href="' + m.link + '">میزیتو</a>' : '')); })) +
    sec('اسپرینت‌های در جریان', '#1f7a76', sprints.map(function (x) { return li('<b>' + esc_(x.name) + '</b>' + (x.goal ? ' — ' + esc_(x.goal) : '') + ' · ' + x.done + ' از ' + x.total + ' امتیاز · ' + x.left + ' روز مانده' + (x.blocked ? ' · <b style="color:#e13748">' + x.blocked + ' مسدود</b>' : '')); })) +
    sec('پیگیری‌های امروز و معوق', '#e13748', fus.map(function (f) { return li('<b>' + f.subject + '</b> — ' + f.person + (f.project_id ? ' · ' + (pname[f.project_id] || '') : '') + ' · ' + f.due_date); })) +
    sec('تسک‌های امروز', '#4f46e5', todayTasks.map(function (t) { return li(t.title + ' — ' + t.assignee + (t.project_id ? ' · ' + (pname[t.project_id] || '') : '')); })) +
    sec('تسک‌های معوق', '#d98d06', overdueTasks.map(function (t) { return li(t.title + ' — ' + t.assignee + ' · ددلاین ' + t.due_date); })) +
    sec('تسک‌های مسدود', '#e13748', blocked.map(function (t) { return li(t.title + ' — ' + t.assignee + (t.blocked_reason ? ' · ' + t.blocked_reason : '') + (t.blocked_by ? ' · منتظر ' + t.blocked_by : '')); })) +
    sec('مایلستون‌های عقب‌افتاده', '#e13748', ms.map(function (m) { return li(m.title + ' · ' + (pname[m.project_id] || '') + ' · ' + m.planned_date); })) +
    '<p style="color:#666;margin-top:24px;font-size:12px">این ایمیل به‌صورت خودکار از Google Sheet مدار ارسال شده است.</p></div>';

  var to = PropertiesService.getScriptProperties().getProperty('DIGEST_TO') || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: to, subject: 'Madar · خلاصه‌ی ' + today, htmlBody: html });
}

// --------------------------------------------------------------------------
// Weekly update cycle — set in the app (back office → settings → weekly cycle), stored in Config:
// week.start, week.due_day, week.weekly_day (Saturday = 0 … Friday = 6). Defaults: Saturday, Wednesday, Thursday.
// remindWeeklyUpdates runs daily; it emails leads with no update this week at 14:00 on the deadline day
// and at 08:00 on the weekly's day, and sends the PMO a list of who is missing.
// --------------------------------------------------------------------------

function installWeeklyReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'remindWeeklyUpdates') ScriptApp.deleteTrigger(t);
  });
  weeklyTriggers_();
  safeAlert_('یادآوری گزارش هفتگی روز مهلت ساعت ۱۴ و صبح روز جلسه‌ی هفتگی ساعت ۸ ارسال می‌شود (روزها از تنظیمات اپ).');
}

// The deadline-day nudge (14:00) and the weekly-morning last call (08:00) both run daily and check the day.
function weeklyTriggers_() {
  ScriptApp.newTrigger('remindWeeklyUpdates').timeBased().everyDays(1).atHour(14).create();
  ScriptApp.newTrigger('remindWeeklyUpdates').timeBased().everyDays(1).atHour(8).create();
}

function weekDay_(key, fallback) {
  var n = Number(setting_(key, ''));
  return setting_(key, '') !== '' && n >= 0 && n <= 6 ? n : fallback;
}

/** Today as Saturday = 0 … Friday = 6, in the script's time zone. */
function todayIndex_(tz) {
  return (Number(Utilities.formatDate(new Date(), tz, 'u')) + 1) % 7; // u: Monday = 1 … Sunday = 7
}

function weekStartISO_(tz) {
  var back = (todayIndex_(tz) - weekDay_('week.start', 0) + 7) % 7;
  return Utilities.formatDate(new Date(Date.now() - back * 86400000), tz, 'yyyy-MM-dd');
}

/** Scheduled: only acts on the deadline day (afternoon run) or the weekly's day (morning run). */
function remindWeeklyUpdates() {
  var tz = Session.getScriptTimeZone();
  var morning = Number(Utilities.formatDate(new Date(), tz, 'H')) < 12;
  var target = morning ? weekDay_('week.weekly_day', 5) : weekDay_('week.due_day', 4);
  if (todayIndex_(tz) !== target) return;
  remindWeeklyUpdatesNow();
}

function remindWeeklyUpdatesNow() {
  if (!automationOn_('update_reminder')) return;
  var data = readAll_();
  var tz = Session.getScriptTimeZone();
  var ws = weekStartISO_(tz);
  var email = {};
  data.Team.forEach(function (m) { if (m.email) email[m.name] = m.email; });
  var missing = data.Projects.filter(function (p) {
    if (p.status !== 'active' || String(p.archived) === '1') return false;
    return !data.Updates.some(function (u) { return u.project_id === p.id && String(u.week_date) >= ws; });
  });
  var byOwner = {};
  missing.forEach(function (p) { (byOwner[p.owner] = byOwner[p.owner] || []).push(p.name); });
  Object.keys(byOwner).forEach(function (owner) {
    if (!email[owner]) return;
    MailApp.sendEmail({
      to: email[owner],
      subject: 'یادآوری گزارش هفتگی · ' + byOwner[owner].join('، '),
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9">' + owner + ' عزیز، سلام<br>گزارش هفتگی این پروژه‌ها هنوز ثبت نشده است: <b>' + byOwner[owner].join('، ') +
        '</b><br>لطفاً پیش از ویکلی دپارتمان CPTO از صفحه‌ی «گزارش هفتگی» ثبت کنید. ممنون 🙏</div>',
    });
  });
  if (missing.length) {
    var to = PropertiesService.getScriptProperties().getProperty('DIGEST_TO') || Session.getEffectiveUser().getEmail();
    MailApp.sendEmail({ to: to, subject: 'Madar · ' + missing.length + ' گزارش هفتگی ارسال نشده', htmlBody: '<div dir="rtl" style="font-family:Tahoma,sans-serif">' + missing.map(function (p) { return p.name + ' — ' + p.owner; }).join('<br>') + '</div>' });
  }
}

// --------------------------------------------------------------------------
// Files — uploads go to one shared Drive folder ("Madar files"), indexed in the Files tab.
// Script property FILE_SHARING: 'link' (default, anyone with the link) or 'domain'.
// --------------------------------------------------------------------------

// Drive REST with the owner's token: only needs the narrow drive.file scope.
function drive_(method, path, payload, contentType) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com' + path, {
    method: method, contentType: contentType || 'application/json', payload: payload,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Drive: ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText() || '{}');
}

function filesFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) return id;
  var f = drive_('post', '/drive/v3/files', JSON.stringify({ name: 'Madar files', mimeType: 'application/vnd.google-apps.folder' }));
  props.setProperty('FOLDER_ID', f.id);
  return f.id;
}

function upload_(b, user) {
  if (!b.data || !b.name) throw new Error('فایل ارسال نشده است');
  guardPrivate_('Files', { entity: b.entity, entity_id: b.entity_id }, user);
  if (b.entity === 'Mizito' && user.access !== 'super' && user.access !== 'exec') throw new Error('این بخش فقط برای CPTO و مدیر برنامه است');
  var bytes = Utilities.base64Decode(b.data);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('حداکثر حجم فایل ۱۰ مگابایت است');
  var boundary = 'atlas' + Date.now();
  var meta = JSON.stringify({ name: b.name, parents: [filesFolder_()] });
  var body = Utilities.newBlob(
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + (b.mime || 'application/octet-stream') + '\r\n\r\n'
  ).getBytes().concat(bytes).concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());
  var file = drive_('post', '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', body, 'multipart/related; boundary=' + boundary);
  // anyone with the link can view, so images render inside the app
  var sharing = PropertiesService.getScriptProperties().getProperty('FILE_SHARING') || 'link';
  var domain = sharing === 'domain' ? String(Session.getEffectiveUser().getEmail()).split('@')[1] : '';
  drive_('post', '/drive/v3/files/' + file.id + '/permissions', JSON.stringify(domain ? { role: 'reader', type: 'domain', domain: domain } : { role: 'reader', type: 'anyone' }));
  var isImage = String(b.mime || '').indexOf('image/') === 0;
  var row = {
    id: 'FL-' + Utilities.getUuid().slice(0, 8), entity: b.entity, entity_id: b.entity_id, name: b.name, mime: b.mime, size: bytes.length,
    // images use the thumbnail endpoint so they render inside <img>
    url: isImage ? 'https://drive.google.com/thumbnail?id=' + file.id + '&sz=w600' : file.webViewLink,
    uploaded_by: user.name, created_at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
  };
  upsert_('Files', row, user);
  return row;
}

// --------------------------------------------------------------------------
// Google Calendar: every planned meeting lands in the calendar of whoever runs the deployment
// (the program manager for "Madar Team"), with a Meet link, and invites the attendees, the
// facilitator and the always-invited people (by default the program manager and the CEO).
// --------------------------------------------------------------------------

/** Names always invited to meetings: Config meeting.always (comma-separated), else super + exec. */
function alwaysInvited_(team) {
  var v = setting_('meeting.always', '');
  if (v) return names_(v);
  return team.filter(function (t) { return (t.access === 'super' || t.access === 'exec') && String(t.active) !== '0'; }).map(function (t) { return t.name; });
}

/** Name → email for everyone: the department (Team) and the registry (Contacts). */
function emailBook_(data) {
  var email = {};
  (data.Contacts || []).forEach(function (c) { if (c.email) email[c.name] = String(c.email).trim(); });
  (data.Team || []).forEach(function (t) { if (t.email) email[t.name] = String(t.email).trim(); });
  return email;
}

/** Guests from outside: raw emails, or names looked up in the email book. */
function guestEmails_(m, email) {
  return String(m.guests || '').split(/[,،\n]+/).map(function (x) { return x.trim(); }).filter(String).map(function (g) {
    var hit = g.match(/[^\s<>]+@[^\s<>]+/);
    return hit ? hit[0] : email[g] || '';
  }).filter(String);
}

function syncMeeting_(meetingId, user) {
  if (setting_('auto.gcal_create', 'on') === 'off') return { skipped: true };
  var data = rawAll_();
  var m = data.Meetings.filter(function (x) { return String(x.id) === String(meetingId); })[0];
  if (!m) throw new Error('جلسه پیدا نشد');
  if (!LEADERS[user.access || 'member'] && m.facilitator !== user.name && !listed_(m.attendees, user.name)) throw new Error('این جلسه مربوط به شما نیست');
  var real = m.gcal_id && String(m.gcal_id).indexOf('g-') !== 0;
  var save = function (id, url) {
    var row = {}; Object.keys(m).forEach(function (k) { row[k] = m[k]; });
    row.gcal_id = id; row.meet_url = url;
    upsert_('Meetings', row, user);
    return { gcal_id: id, meet_url: url };
  };
  if (m.status === 'cancelled') {
    if (real) { try { Calendar.Events.remove('primary', m.gcal_id, { sendUpdates: 'all' }); } catch (eGone) {} }
    return save('', m.meet_url);
  }
  var email = emailBook_(data);
  var people = names_(m.attendees).concat([m.facilitator]).concat(alwaysInvited_(data.Team));
  var seen = {};
  var attendees = people.map(function (n) { return email[n]; }).concat(guestEmails_(m, email)).filter(function (e) {
    if (!e || seen[e.toLowerCase()]) return false;
    seen[e.toLowerCase()] = 1; return true;
  }).map(function (e) { return { email: e }; });
  var tz = Session.getScriptTimeZone();
  var start = Utilities.parseDate(m.date + ' ' + (m.time || '10:00'), tz, 'yyyy-MM-dd HH:mm');
  var end = new Date(start.getTime() + (Number(m.duration) || 45) * 60000);
  var iso = function (d) { return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ss"); };
  var proj = m.project_id ? data.Projects.filter(function (p) { return String(p.id) === String(m.project_id); })[0] : null;
  var agenda = agendaOf_(m, data);
  var description = (proj ? 'پروژه: ' + proj.name + '\n' : '') +
    (agenda.length ? '\nدستور جلسه:\n' + agenda.map(function (a) { return '• ' + a; }).join('\n') + '\n' : '') +
    '\nاز مدار' + (appLink_() ? ' — ' + appLink_() + '#/meetings' : '');
  var res = {
    summary: m.title, description: description,
    start: { dateTime: iso(start), timeZone: tz }, end: { dateTime: iso(end), timeZone: tz },
    attendees: attendees,
  };
  var ev = null;
  if (real) {
    try { ev = Calendar.Events.patch(res, 'primary', m.gcal_id, { sendUpdates: 'all' }); } catch (eMissing) { ev = null; }
  }
  if (!ev) {
    if (!m.meet_url) res.conferenceData = { createRequest: { requestId: 'madar-' + m.id + '-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    ev = Calendar.Events.insert(res, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
  }
  var url = ev.hangoutLink || m.meet_url || '';
  if (!url && ev.conferenceData && ev.conferenceData.entryPoints) {
    ev.conferenceData.entryPoints.forEach(function (p) { if (p.entryPointType === 'video' && !url) url = p.uri; });
  }
  var out = save(ev.id, url);
  out.invited = attendees.length;
  return out;
}

/** The planning agenda: "T:id,D:id,M:id" (task, output, milestone) resolved to titles. */
function agendaOf_(m, data) {
  return String(m.items || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(function (ref) {
    var kind = ref.slice(0, 1), id = ref.slice(2);
    var list = kind === 'D' ? data.Deliverables : kind === 'M' ? data.Milestones : data.Tasks;
    var row = (list || []).filter(function (r) { return String(r.id) === id; })[0];
    return row ? row.title || row.name : '';
  }).filter(Boolean);
}

// --------------------------------------------------------------------------
// Meeting minutes & action plan email (automation: minutes_mail)
// --------------------------------------------------------------------------

function mailMinutes_(meetingId, user) {
  if (!automationOn_('minutes_mail')) return { skipped: true };
  var data = readAll_();
  var m = data.Meetings.filter(function (x) { return String(x.id) === String(meetingId); })[0];
  if (!m) throw new Error('جلسه پیدا نشد');
  var email = emailBook_(data);
  var to = String(m.attendees || '').split(',').map(function (n) { return email[n.trim()]; }).concat(guestEmails_(m, email)).filter(Boolean);
  if (!to.length) return { sent: 0 };
  var owners = privateOwners_(data.Team);
  var actions = data.Tasks.filter(function (t) { return String(t.meeting_id) === String(m.id) && String(t.private) !== '1' && !owners[lead_(t)]; });
  var esc = function (x) { return String(x || '').replace(/</g, '&lt;'); };
  var lines = function (x) { return String(x || '').split('\n').filter(function (l) { return l.trim(); }); };
  var html = '<div dir="rtl" style="font-family:Tahoma,sans-serif;font-size:14px;line-height:1.9;color:#111">' +
    '<h2 style="margin:0">' + esc(m.title) + '</h2><div style="color:#666">' + m.date + ' · ' + esc(m.time) + '</div>' +
    (m.notes ? '<h3>صورت‌جلسه</h3><p>' + esc(m.notes).replace(/\n/g, '<br>') + '</p>' : '') +
    (lines(m.decisions).length ? '<h3>تصمیم‌ها</h3><ul>' + lines(m.decisions).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' : '') +
    (actions.length ? '<h3>اکشن پلن</h3><table cellpadding="6" style="border-collapse:collapse">' + actions.map(function (t) {
      return '<tr><td style="border-bottom:1px solid #eee">' + esc(t.title) + '</td><td style="border-bottom:1px solid #eee"><b>' + esc(t.assignee) + '</b></td><td style="border-bottom:1px solid #eee;color:#666">' + (t.due_date || '') + '</td></tr>';
    }).join('') + '</table>' : '') +
    '<p style="color:#888;font-size:12px;margin-top:20px">ارسال خودکار از مدار — ' + esc(user.name) + '</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: 'صورت‌جلسه · ' + m.title + ' · ' + m.date, htmlBody: html });
  return { sent: to.length };
}

// --------------------------------------------------------------------------
// Overdue action reminders (automation: action_reminder) — every morning
// --------------------------------------------------------------------------

function remindOverdueActions() {
  if (!automationOn_('action_reminder')) return;
  var data = readAll_();
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var email = {};
  data.Team.forEach(function (t) { if (t.email) email[t.name] = t.email; });
  var by = {};
  var gone = archivedSet_(data);
  data.Tasks.filter(function (t) { return t.meeting_id && t.status !== 'done' && t.due_date && t.due_date < today && !gone[t.project_id]; })
    .forEach(function (t) { assignees_(t).forEach(function (a) { (by[a] = by[a] || []).push(t); }); });
  Object.keys(by).forEach(function (who) {
    if (!email[who]) return;
    MailApp.sendEmail({
      to: email[who],
      subject: 'مدار · ' + by[who].length + ' اقدام عقب‌افتاده',
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9">' + who + ' عزیز، این اقدام‌های جلسات از سررسیدشان گذشته‌اند:<ul>' +
        by[who].map(function (t) { return '<li>' + String(t.title).replace(/</g, '&lt;') + ' — ' + t.due_date + '</li>'; }).join('') + '</ul></div>',
    });
  });
}

/** One click: installs every scheduled automation. Each one checks its on/off switch before running. */
function installAutomations() {
  var keep = { sendDailyDigest: 1, remindWeeklyUpdates: 1, remindOverdueActions: 1, sendTaskAlerts: 1 };
  ScriptApp.getProjectTriggers().forEach(function (t) { if (keep[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(7).nearMinute(30).create();
  safeAlert_('خلاصه‌ی صبحگاهی (۷:۳۰) نصب شد. روشن یا خاموش بودنش از بک‌آفیس ← تنظیمات ← اتوماسیون‌ها.');
}

// --------------------------------------------------------------------------
// Task alerts & weekly delivery days
//   assign_mail     — the moment a task is handed to someone, they get an email
//   task_alerts     — every morning (08:30): follow-up dates, hand-off / testing days, deadlines (today and tomorrow)
//                     to everyone on the task (assignee, creator, shared with, trackers); a task can mute itself (notify = off)
//   delivery_alerts — every morning: projects whose weekly delivery day is today (to the lead), and yesterday's
//                     deliveries that were not recorded (to the lead and the program manager)
// Archived projects are skipped everywhere.
// --------------------------------------------------------------------------

function appLink_() { return PropertiesService.getScriptProperties().getProperty('API_URL') || ''; }
function esc_(x) { return String(x || '').replace(/</g, '&lt;'); }
function mailBox_(title, body) {
  var link = appLink_();
  return '<div dir="rtl" style="font-family:Tahoma,Vazirmatn,sans-serif;font-size:14px;line-height:1.9;color:#111">' + title + body +
    (link ? '<p style="margin-top:18px"><a href="' + link + '" style="background:#16181d;color:#fff;padding:8px 18px;border-radius:999px;text-decoration:none">باز کردن مدار</a></p>' : '') +
    '<p style="color:#888;font-size:12px;margin-top:18px">ارسال خودکار از مدار</p></div>';
}
function archivedSet_(data) {
  var gone = {};
  (data.Projects || []).forEach(function (p) { if (String(p.archived) === '1') gone[p.id] = 1; });
  return gone;
}
function emails_(data) {
  var email = {};
  (data.Team || []).forEach(function (m) { if (m.email && String(m.active) !== 'false') email[m.name] = m.email; });
  return email;
}
function names_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

/** Email to the new assignee when a task is handed to them by someone else. */
function mailAssigned_(before, row, user) {
  if (!row || String(row.notify) === 'off' || row.status === 'done') return;
  if (!automationOn_('assign_mail')) return;
  var had = before ? assignees_(before) : [];
  var fresh = assignees_(row).filter(function (a) { return had.indexOf(a) === -1 && a !== user.name; });
  if (!fresh.length) return;
  var data = rawAll_();
  if (row.project_id && archivedSet_(data)[row.project_id]) return;
  var mail = emails_(data);
  var to = fresh.map(function (a) { return mail[a]; }).filter(Boolean).join(',');
  if (!to) return;
  var pname = ((data.Projects || []).filter(function (p) { return String(p.id) === String(row.project_id); })[0] || {}).name || '';
  var line = function (k, v) { return v ? '<div><span style="color:#666">' + k + ':</span> ' + esc_(v) + '</div>' : ''; };
  MailApp.sendEmail({
    to: to,
    subject: 'مدار · تسک جدید برای شما: ' + row.title,
    htmlBody: mailBox_('<h3 style="margin:0 0 8px">' + esc_(user.name) + ' این تسک را به شما سپرد</h3>',
      '<div style="font-size:16px;font-weight:bold">' + esc_(row.title) + '</div>' + line('پروژه', pname) + line('حوزه', row.area) + line('سررسید', row.due_date) +
      line('تحویل به پروداکت', row.handoff_date) + line('تست', row.test_date) + line('ددلاین', row.deadline) + (row.description ? '<p>' + esc_(row.description).replace(/\n/g, '<br>') + '</p>' : '')),
  });
}

/** On demand (leadership): email a task to everyone on it. Notifications otherwise stay in the app. */
function mailTask_(id, user) {
  if (!LEADERS[user.access]) throw new Error('فقط لیدرشیپ می‌تواند ایمیل بفرستد');
  var data = rawAll_();
  var t = (data.Tasks || []).filter(function (x) { return String(x.id) === String(id); })[0];
  if (!t) throw new Error('تسک پیدا نشد');
  var owners = privateOwners_(data.Team || []);
  if (!canSeeTask_(t, user, owners) && user.access !== 'super') throw new Error('این تسک خصوصی است');
  var mail = emails_(data);
  var who = assignees_(t).concat(names_(t.collaborators), names_(t.watchers)).filter(function (n, i, a) { return n && n !== user.name && a.indexOf(n) === i && canSeeTask_(t, { name: n }, owners); });
  var to = who.map(function (n) { return mail[n]; }).filter(Boolean);
  if (!to.length) throw new Error('برای افراد این تسک ایمیلی ثبت نشده');
  var pname = ((data.Projects || []).filter(function (p) { return String(p.id) === String(t.project_id); })[0] || {}).name || '';
  var line = function (k, v) { return v ? '<div><span style="color:#666">' + k + ':</span> ' + esc_(v) + '</div>' : ''; };
  MailApp.sendEmail({
    to: to.join(','),
    subject: 'مدار · ' + t.title,
    htmlBody: mailBox_('<h3 style="margin:0 0 8px">' + esc_(user.name) + ' این تسک را برای شما فرستاد</h3>',
      '<div style="font-size:16px;font-weight:bold">' + esc_(t.title) + '</div>' + line('پروژه', pname) + line('مسئول', assignees_(t).join('، ')) + line('سررسید', t.due_date) + line('ددلاین', t.deadline) +
      (t.description ? '<p>' + esc_(t.description).replace(/\n/g, '<br>') + '</p>' : '')),
  });
  return { sent: to.length };
}

function sendTaskAlerts() {
  var data = readAll_();
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz, 'yyyy-MM-dd');
  var email = emails_(data);
  var gone = archivedSet_(data);
  var owners = privateOwners_(data.Team || []);
  var pname = {};
  (data.Projects || []).forEach(function (p) { pname[p.id] = p.name; });
  var box = {};
  var add = function (who, t, why) {
    if (!who || !email[who] || !canSeeTask_(t, { name: who }, owners)) return;
    var k = who + '|' + t.id;
    box[who] = box[who] || { seen: {}, items: [] };
    if (box[who].seen[k + why]) return;
    box[who].seen[k + why] = 1;
    box[who].items.push('<li style="margin:4px 0"><b>' + esc_(t.title) + '</b> — ' + why + (t.project_id ? ' · ' + esc_(pname[t.project_id] || '') : '') + (t.assignee && t.assignee !== who ? ' · مسئول: ' + esc_(t.assignee) : '') + '</li>');
  };
  if (automationOn_('task_alerts')) {
    (data.Tasks || []).forEach(function (t) {
      if (t.status === 'done' || String(t.notify) === 'off' || (t.project_id && gone[t.project_id])) return;
      var everyone = assignees_(t).concat([t.reporter], names_(t.collaborators), names_(t.watchers));
      var doers = assignees_(t).concat(names_(t.collaborators), names_(t.watchers));
      if (t.follow_date === today) everyone.forEach(function (w) { add(w, t, 'امروز تاریخ پیگیری است'); });
      if (t.handoff_date === today) doers.forEach(function (w) { add(w, t, 'امروز تحویل به پروداکت'); });
      if (t.test_date === today) doers.forEach(function (w) { add(w, t, 'امروز زمان تست'); });
      if (t.deadline === tomorrow) doers.forEach(function (w) { add(w, t, 'ددلاین فردا'); });
      if (t.deadline === today) everyone.forEach(function (w) { add(w, t, '<span style="color:#e13748">ددلاین امروز</span>'); });
    });
  }
  if (automationOn_('delivery_alerts')) {
    var ws = weekStartISO_(tz);
    var start = weekDay_('week.start', 0);
    var yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
    var pm = PropertiesService.getScriptProperties().getProperty('DIGEST_TO') || Session.getEffectiveUser().getEmail();
    var missed = [];
    (data.Projects || []).forEach(function (p) {
      if (gone[p.id] || (p.status !== 'active' && p.status !== 'planning') || p.delivery_day === '' || p.delivery_day === undefined) return;
      var day = Number(p.delivery_day);
      if (!(day >= 0 && day <= 6)) return;
      var due = Utilities.formatDate(new Date(new Date(ws + 'T12:00:00').getTime() + ((day - start + 7) % 7) * 86400000), tz, 'yyyy-MM-dd');
      var done = (p.last_delivery && String(p.last_delivery) >= ws) || (data.Deliveries || []).some(function (x) { return String(x.project_id) === String(p.id) && String(x.week) === ws; });
      if (done) return;
      var fake = { id: 'P' + p.id, title: 'تحویل هفتگی ' + p.name, assignee: p.owner, reporter: '', private: '' };
      if (due === today) add(p.owner, fake, 'امروز روز تحویل هفتگی است — بعد از تحویل در مدار «تحویل شد» را بزنید');
      var grace = Number(setting_('delivery.grace', '0')) || 0;
      var lastDay = Utilities.formatDate(new Date(new Date(due + 'T12:00:00').getTime() + grace * 86400000), tz, 'yyyy-MM-dd');
      if (lastDay === yesterday) { add(p.owner, fake, '<span style="color:#e13748">تحویل دیروز ثبت نشده</span>'); missed.push(esc_(p.name) + ' — ' + esc_(p.owner || '—')); }
    });
    if (missed.length && pm) MailApp.sendEmail({ to: pm, subject: 'مدار · ' + missed.length + ' تحویل هفتگی ثبت نشد', htmlBody: mailBox_('<h3 style="margin:0 0 8px">تحویل‌های دیروز که ثبت نشده‌اند</h3>', missed.join('<br>')) });
  }
  Object.keys(box).forEach(function (who) {
    MailApp.sendEmail({ to: email[who], subject: 'مدار · یادآوری‌های امروز (' + box[who].items.length + ')', htmlBody: mailBox_('<h3 style="margin:0 0 8px">' + esc_(who) + ' عزیز، صبح بخیر</h3>', '<ul style="padding-right:18px;margin:0">' + box[who].items.join('') + '</ul>') });
  });
}

// --------------------------------------------------------------------------
// Sample data (optional)
// --------------------------------------------------------------------------

/** Fills the sheet with the real team and project names (nothing else). Safe to run twice. */
function seedDemo() {
  setup();
  var put = function (name, rows) {
    var sh = ensureSheet_(name, SCHEMA[name]);
    var h = SCHEMA[name];
    var have = readSheet_(sh).map(function (r) { return String(r.id); });
    rows = rows.filter(function (r) { return have.indexOf(String(r.id)) === -1; });
    var vals = rows.map(function (r) { return h.map(function (k) { return r[k] === undefined ? '' : r[k]; }); });
    if (vals.length) sh.getRange(sh.getLastRow() + 1, 1, vals.length, h.length).setValues(vals);
  };
  put('Team', [
    ['m1', 'وحید عامری', 'Vahid Ameri', 'pgm', '', 'super'],
    ['m2', 'جلیل علیزاده', 'Jalil Alizadeh', 'cpto', '', 'exec'],
  ].map(function (r) {
    return { id: r[0], name: r[1], name_en: r[2], role: r[3], track: r[4], access: r[5], capacity: 100, active: 'true', tasks_private: '' };
  }));
  fillUsernames_();
  bumpVersion_();
}

// --------------------------------------------------------------------------
// Mizito agent — a browser extension reads Mizito (mentions, open tasks, comments) in the
// person's own logged-in browser and sends it here. It signs in with its own key, bound to one
// person (the PgM or the CPTO): the key is made in the app (Mizito → settings) and only its hash
// is kept. Mizito decides whether a task is open or done; everything else (priority, category,
// notes, links) stays Madar's and is never overwritten.
// --------------------------------------------------------------------------

var MZ_TEXT_SHEETS = { Mizito: 1, MizitoMentions: 1, MizitoComments: 1 };
var MZ_CUTOFF = '2026-06-22'; // 1 Tir 1405: the agent reads tasks with activity since then
var MZ_AGENT = { name: 'میزیتو' }; // how the agent's changes are signed in the log

function mzAgents_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('MZ_AGENTS') || '{}'); } catch (e) { return {}; }
}
function mzSaveAgents_(all) { PropertiesService.getScriptProperties().setProperty('MZ_AGENTS', JSON.stringify(all)); }

function mzAgent_(token) {
  if (!token) throw new Error('کلید ایجنت لازم است');
  var a = mzAgents_()[hash_(token)];
  if (!a) throw new Error('کلید ایجنت نامعتبر است یا باطل شده؛ از مدار ← میزیتو ← تنظیمات کلید تازه بگیرید');
  var m = (rawAll_().Team || []).filter(function (x) { return x.name === a.name && String(x.active).toLowerCase() !== 'false'; })[0];
  if (!m || (m.access !== 'super' && m.access !== 'exec')) throw new Error('صاحب این کلید دیگر به میزیتوی مدار دسترسی ندارد');
  return { name: a.name };
}

function mzNow_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

/** Sync status per person, kept in Config (mz.agent.<name>) so the app can show it. */
function mzStatus_(name) {
  try { return JSON.parse(setting_('mz.agent.' + name, '{}')) || {}; } catch (e) { return {}; }
}
function mzSetStatus_(name, patch) {
  var st = mzStatus_(name);
  Object.keys(patch).forEach(function (k) { st[k] = patch[k]; });
  upsert_('Config', { id: 'mz.agent.' + name, value: JSON.stringify(st) }, MZ_AGENT);
}

/** A new key for a person's agent; any older key of theirs stops working. Shown once. */
function mzAgentKey_(name) {
  var m = (rawAll_().Team || []).filter(function (x) { return x.name === name; })[0];
  if (!m || (m.access !== 'super' && m.access !== 'exec')) throw new Error('کلید ایجنت فقط برای مدیر برنامه و CPTO ساخته می‌شود');
  var token = 'mza_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var all = mzAgents_();
  Object.keys(all).forEach(function (k) { if (all[k].name === name) delete all[k]; });
  all[hash_(token)] = { name: name, at: mzNow_() };
  mzSaveAgents_(all);
  mzSetStatus_(name, { key_at: mzNow_(), revoked: '' });
  return { name: name, token: token };
}

function mzAgentRevoke_(name) {
  var all = mzAgents_();
  Object.keys(all).forEach(function (k) { if (all[k].name === name) delete all[k]; });
  mzSaveAgents_(all);
  mzSetStatus_(name, { revoked: mzNow_() });
  return { name: name };
}

/** What the agent needs before it reads: the cutoff, its last run, and what Madar already has. */
function mzHello_(agent) {
  var known = {};
  // a task counts as known to this agent only once it carries this person's name (the other person's
  // agent may have brought it), so a shared task is sent again and gets both names
  (rawAll_().Mizito || []).forEach(function (m) { if (m.mz_key) known[String(m.mz_key).replace(/^.*_sl/i, '')] = names_(m.mentioned).indexOf(agent.name) !== -1 && m.mz_state !== 'gone' && !/\/inbox\/[0-9a-f]{24}$/.test(String(m.link)) ? String(m.mz_sig || '') : ''; });
  var mids = [];
  var since = setting_('mz.agent.cutoff', MZ_CUTOFF);
  (rawAll_().MizitoMentions || []).forEach(function (x) { if (x.mz_id && x.account === agent.name && String(x.at) >= since) mids.push(String(x.mz_id)); });
  (rawAll_().Mizito || []).forEach(function (m) { if (m.ext_id && names_(m.mentioned).indexOf(agent.name) !== -1) mids.push(String(m.ext_id)); });
  var st = mzStatus_(agent.name);
  return { mentions: mids, account: agent.name, cutoff: setting_('mz.agent.cutoff', MZ_CUTOFF), last: st.done_at || '', known: known, version: MADAR_VERSION };
}

function mzStatusList_() {
  var parse = function (d) { try { var v = JSON.parse(setting_('mz.statuses', '')); return Array.isArray(v) && v.length ? v : d; } catch (e) { return d; } };
  return parse([{ id: 'needs_action', cat: 'open' }, { id: 'in_progress', cat: 'open' }, { id: 'awaiting', cat: 'waiting' }, { id: 'blocked', cat: 'blocked' }, { id: 'done', cat: 'done' }, { id: 'cancelled', cat: 'cancelled' }]);
}

/**
 * One batch from the agent: items = Mizito tasks, each with its snapshot (title, state, people,
 * deadline…), the mentions of this person and, when they changed, the comments. Idempotent:
 * tasks are matched by their Mizito id, mentions and comments by theirs.
 * seen (on the last batch of a full read) = every task the agent saw open, so the ones no longer
 * in this person's Mizito are marked.
 */
function mzIngest_(body, agent) {
  var data = rawAll_();
  var tz = Session.getScriptTimeZone();
  var now = mzNow_();
  var ts = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
  };
  var long = function (v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n || 4000); };
  var listed = function (s, me) { return names_(s).indexOf(me) !== -1; };
  var statuses = mzStatusList_();
  var catOf = function (id) { var x = statuses.filter(function (st) { return st.id === id; })[0]; return x ? x.cat : 'open'; };
  var firstOf = function (cat) { var x = statuses.filter(function (st) { return st.cat === cat; })[0]; return x ? x.id : statuses[0].id; };

  var byKey = {};
  // a key taken by hand from Mizito's own link is "<workspace>_sl<task>": the task id is what matches
  (data.Mizito || []).forEach(function (m) { if (m.mz_key) byKey[String(m.mz_key).replace(/^.*_sl/i, '')] = m; });
  var mentionIds = {};
  (data.MizitoMentions || []).forEach(function (x) { if (x.mz_id) mentionIds[String(x.mz_id)] = 1; });
  var comments = {};
  (data.MizitoComments || []).forEach(function (c) { comments[String(c.id)] = c; });

  var items = {}, mentions = [], notes = [], hist = [];
  var made = 0, updated = 0;
  var log = function (m, field, from, to) { if (String(from) !== String(to)) hist.push({ entity: 'Mizito', entity_id: m.id, field: field, from: clip_(from), to: clip_(to) }); };

  // oldest first: new rows go into the sheet in the order they were first mentioned
  var ordered = (body.items || []).slice().sort(function (a, b) {
    var x = String((a && a.first_at) || ''), y = String((b && b.first_at) || '');
    return x === y ? 0 : x < y ? -1 : 1;
  });
  ordered.forEach(function (t) {
    if (!t || !t.key) return;
    var key = String(t.key);
    var cur = items[key] || byKey[key];
    // an import may leave a field empty (Claude did not see it): Madar keeps what it has
    if (body.version === 'import') t = mzFill_(t, cur);
    var ments = (t.mentions || []).filter(function (x) { return x && x.id && x.at; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var m;
    if (cur) {
      m = {};
      for (var k in cur) m[k] = cur[k];
    } else {
      if (!t.title) return; // a mention-only update for a task Madar never had: wait for the full one
      var first = ments[0];
      m = {
        id: 'MZ-' + key, mz_key: key, link: t.link || '', title: long(t.title, 300), description: long(t.notes), docs: '',
        asked_by: first && first.by ? first.by : t.owner || '', mentioned: agent.name, category: '', action: '',
        status: t.completed && !mzAskedAfter_(t, ments, ts) ? firstOf('done') : mzAnsweredLast_(t, ments, agent.name, ts) ? firstOf('waiting') : firstOf('open'),
        priority_override: '', override_reason: '', urgent: '', assigned_to: '', due_date: ts(t.deadline).slice(0, 10),
        received_at: first ? ts(first.at) : ts(t.first_at) || ts(t.created_at) || now, last_mention_at: '', last_mention_by: '',
        outcome: '', notes: '', created_at: now.slice(0, 10), updated_at: now, closed_at: '', ext_id: first ? String(first.id) : '',
        source: 'agent', review: t.completed ? '' : 'new', mz_state: '', mz_deadline: ts(t.deadline).slice(0, 10),
      };
      m.last_mention_at = m.received_at;
      m.last_mention_by = m.asked_by;
      if (catOf(m.status) === 'done') m.closed_at = ts(t.completed_at) || now;
      if (t.completed && catOf(m.status) !== 'done') { m.mz_again = ments[ments.length - 1] ? ts(ments[ments.length - 1].at) : ''; m.review = 'new'; }
      hist.push({ entity: 'Mizito', entity_id: m.id, field: '_created', from: '', to: m.status });
      made++;
    }
    if (!listed(m.mentioned, agent.name)) m.mentioned = names_(m.mentioned).concat([agent.name]).join(', ');
    var newComments = [], changes = [], actor = '';

    if (t.title) {
      // the snapshot: Mizito's own facts about the task
      var dl = ts(t.deadline).slice(0, 10);
      var prevDl = String(m.mz_deadline || '');
      if (dl !== prevDl) {
        // the deadline follows Mizito unless it was set by hand in Madar
        if (!m.due_date || m.due_date === prevDl) { log(m, 'due_date', m.due_date, dl); m.due_date = dl; }
        m.mz_deadline = dl;
      }
      if (!m.title) m.title = long(t.title, 300);
      if (t.notes && (!m.description || (m.source === 'agent' && String(t.notes).length > String(m.description).length))) m.description = long(t.notes);
      // the link is Mizito's own («لینک وظیفه», learnt by the agent); a link typed by hand stays
      // the task's conversation in Mizito (#/ws/im/<dialog>/): always opens
      if (t.chat_link) m.mz_chat = String(t.chat_link);
      // only a link taken from Mizito's own «لینک وظیفه» is kept; an earlier, guessed one is cleared
      if (t.link) {
        if (t.link !== m.link && (m.source === 'agent' || !m.link || /\/inbox\/[0-9a-f]{24}$/.test(String(m.link)))) m.link = t.link;
        m.mz_link_ok = '1';
      }
      // a link added by hand in Madar stays
      // when the assistant first wrote to each person about it; the earliest is "mentioned in Mizito"
      if (t.first_at) {
        var firsts = mzFirsts_(m.mz_first);
        var f = ts(t.first_at);
        if (f) firsts[agent.name] = f; // every read goes back to the cutoff, so this is that person's first
        m.mz_first = Object.keys(firsts).map(function (k) { return k + '=' + firsts[k]; }).join('\n');
        if (m.source === 'agent') {
          var earliest = Object.keys(firsts).reduce(function (a, k) { return !a || firsts[k] < a ? firsts[k] : a; }, '');
          if (earliest) m.received_at = earliest;
        }
      }
      // what changed in Mizito since the last read, so the people it was brought for notice
      var synced = cur && cur.mz_state;
      if (synced) {
        var ticks = function (x) { return (String(x || '').match(/✓/g) || []).length; };
        var nextChecklist = long((t.checklist || []).map(function (c) { return (c.ok ? '✓ ' : '○ ') + c.t; }).join('\n'), 2000);
        if (!!t.completed !== (cur.mz_state === 'done')) {
          actor = t.completed ? t.completed_by || '' : '';
          changes.push(t.completed ? 'در میزیتو انجام شد' + (actor ? ' (' + actor + ')' : '') : 'در میزیتو دوباره باز شد');
          hist.push({ entity: 'Mizito', entity_id: m.id, field: 'mz_state', from: clip_(cur.mz_state), to: t.completed ? 'done' : 'open', by: actor || MZ_AGENT.name });
        }
        if (String(t.progress === undefined || t.progress === null ? '' : t.progress) !== String(cur.mz_progress) && !t.completed) {
          changes.push('پیشرفت ' + (cur.mz_progress || 0) + '٪ ← ' + (t.progress || 0) + '٪');
          hist.push({ entity: 'Mizito', entity_id: m.id, field: 'mz_progress', from: clip_(cur.mz_progress), to: clip_(t.progress), by: MZ_AGENT.name });
        }
        if (dl !== String(cur.mz_deadline || '')) {
          changes.push(dl ? 'مهلت در میزیتو تغییر کرد' : 'مهلت در میزیتو برداشته شد');
          hist.push({ entity: 'Mizito', entity_id: m.id, field: 'mz_deadline', from: clip_(cur.mz_deadline), to: dl, by: MZ_AGENT.name });
        }
        var ticked = ticks(nextChecklist) - ticks(cur.mz_checklist);
        if (ticked > 0) changes.push(ticked + ' مورد چک‌لیست تیک خورد');
        if ((t.assignees || []).join(', ') !== String(cur.mz_assignees || '')) changes.push('مسئولان تغییر کرد');
      }
      m.mz_project = t.project || '';
      m.mz_owner = t.owner || '';
      m.mz_assignees = (t.assignees || []).join(', ');
      m.mz_labels = (t.labels || []).join(', ');
      m.mz_checklist = long((t.checklist || []).map(function (c) { return (c.ok ? '✓ ' : '○ ') + c.t; }).join('\n'), 2000);
      m.mz_progress = t.progress === undefined || t.progress === null ? '' : t.progress;
      if (t.last_at) {
        m.mz_last_at = ts(t.last_at);
        m.mz_last_by = t.last_by || '';
        // the ask (and its SLA) is always the person who mentioned: a later comment never takes its place
      }
      var was = String(m.mz_state || '');
      m.mz_state = t.completed ? 'done' : 'open';
      m.mz_done_at = t.completed ? ts(t.completed_at) : '';
      m.mz_done_by = t.completed ? t.completed_by || '' : '';
      // Mizito decides whether it is open or done (an item set aside in Madar stays aside)
      var cat = catOf(m.status);
      if (cur && m.review !== 'ignored') {
        var doneAt = ts(t.completed_at);
        var askedAfter = doneAt && String(m.last_mention_at || '') > doneAt;
        if (t.completed && cat !== 'done' && cat !== 'cancelled' && !askedAfter) {
          log(m, 'status', m.status, firstOf('done'));
          m.status = firstOf('done');
          m.closed_at = m.mz_done_at || now;
          if (!m.outcome) m.outcome = 'در میزیتو' + (m.mz_done_by ? ' توسط ' + m.mz_done_by : '') + ' انجام شد';
        } else if (!t.completed && cat === 'done' && was === 'done') {
          log(m, 'status', m.status, firstOf('open'));
          m.status = firstOf('open');
          m.closed_at = '';
        }
      }
      if (t.sig) m.mz_sig = String(t.sig);
    }

    // who asked = whoever mentioned first (the SLA follows their tier); the owner only while no mention is known
    if (m.source === 'agent' && ments.length && ments[0].by) {
      var firstAt = ts(ments[0].at);
      if (!m.ext_id || !m.asked_by || m.asked_by === m.mz_owner || (firstAt && firstAt < String(m.received_at || '9999'))) {
        if (m.asked_by !== ments[0].by && cur) log(m, 'asked_by', m.asked_by, ments[0].by);
        m.asked_by = ments[0].by;
      }
    }
    var fresh = [];
    var prevAsk = String(cur ? cur.last_mention_at || cur.received_at || '' : '');
    ments.forEach(function (x) {
      var id = String(x.id);
      if (mentionIds[id] || id === String(m.ext_id || '')) return;
      mentionIds[id] = 1;
      var at = ts(x.at);
      // asked again: a mention Madar did not have, made after the latest ask it knew of (an older
      // mention read late, or one from a second person's first read, is history, not a new ask)
      if (cur && listed(cur.mentioned, agent.name) && at > prevAsk) fresh.push({ by: x.by || '', at: at });
      mentions.push({ id: 'MM-' + id, item_id: m.id, by: x.by || '', at: at, note: '', status: '', mz_id: id, account: agent.name, mz_comment: x.comment || '' });
      if (at > String(m.last_mention_at || '')) { m.last_mention_at = at; m.last_mention_by = x.by || ''; }
      if (m.source !== 'agent' && at < String(m.received_at || '9999')) m.received_at = at;
    });

    (t.comments || []).forEach(function (c) {
      if (!c || !c.id) return;
      var row = { id: 'MC-' + c.id, item_id: m.id, by: c.by || '', at: ts(c.at), body: long(c.body), mentions: (c.mentions || []).join(', '), reply_to: c.reply_to ? 'MC-' + c.reply_to : '', files: long((c.files || []).join('\n'), 1000) };
      var old = comments[row.id];
      if (old && String(old.body) === row.body && String(old.files || '') === row.files && String(old.mentions || '') === row.mentions) return;
      if (!old && cur && cur.mz_state && row.at > String(cur.mz_last_at || cur.received_at || '')) newComments.push(row);
      comments[row.id] = row;
      notes.push(row);
    });

    if (newComments.length) {
      var who = [];
      newComments.forEach(function (c) { if (who.indexOf(c.by) === -1) who.push(c.by); });
      changes.push(who.join('، ') + (newComments.length > 1 ? ' ' + newComments.length + ' کامنت گذاشتند' : ' کامنت گذاشت'));
    }
    // the same task asked about again: back on the person's desk, its SLA counting from the new ask
    if (fresh.length) {
      var again = fresh.reduce(function (a, x) { return x.at > a ? x.at : a; }, '');
      var askers = [];
      fresh.forEach(function (x) { if (x.by && askers.indexOf(x.by) === -1) askers.push(x.by); });
      m.mz_again = again;
      var cat2 = catOf(m.status);
      if ((cat2 === 'done' || cat2 === 'cancelled') && again > String(m.closed_at || '')) {
        log(m, 'status', m.status, firstOf('open'));
        m.status = firstOf('open');
        m.closed_at = '';
        changes.push('بعد از بسته شدن دوباره منشن شد');
      } else if (cat2 === 'waiting') {
        log(m, 'status', m.status, firstOf('open'));
        m.status = firstOf('open');
      }
      // set aside in Madar, but asked again: it comes back for a look
      if (m.review === 'ignored') m.review = 'new';
      changes.push((askers.join('، ') || 'کسی') + ' دوباره منشن کرد' + (fresh.length > 1 ? ' (' + fresh.length + ' بار)' : ''));
    }
    if (changes.length) {
      var last = newComments.reduce(function (a, c) { return c.at > a ? c.at : a; }, '');
      m.mz_change = long(changes.join(' · '), 300);
      m.mz_changed_at = last && last > String(cur && cur.mz_changed_at || '') ? last : now;
    }
    m.synced_at = now;
    if (cur && !items[key]) updated++;
    items[key] = m;
  });

  // after a full read: open tasks this person's Mizito no longer shows
  var gone = 0;
  if (Array.isArray(body.seen)) {
    var seen = {};
    body.seen.forEach(function (k) { seen[String(k)] = 1; });
    (data.Mizito || []).forEach(function (m) {
      var key = String(m.mz_key || '');
      // only tasks in this person's inbox (they are an assignee): a task they were just mentioned on
      // is never in that list, and clearing a mention notice in Mizito must not hide it
      if (!key || seen[key] || items[key] || m.mz_state !== 'open' || !listed(m.mz_assignees, agent.name)) return;
      var c = {};
      for (var k in m) c[k] = m[k];
      c.mz_state = 'gone';
      c.mz_sig = ''; // read in full again when it shows up
      c.synced_at = now;
      items[key] = c;
      gone++;
    });
  }

  // what Madar holds follows the assistant's messages: a task the agent brought only from the inbox
  // (earlier versions) and nobody has touched goes away once a complete read shows no message about it
  var removed = [];
  if (Array.isArray(body.assistant)) {
    var said = {};
    body.assistant.forEach(function (k) { said[String(k)] = 1; });
    var inCart = {};
    (data.Cartable || []).forEach(function (c) { if (c.entity === 'Mizito') inCart[c.entity_id] = 1; });
    var hasMentions = {};
    (data.MizitoMentions || []).forEach(function (x) { hasMentions[x.item_id] = 1; });
    (data.Mizito || []).forEach(function (m) {
      var key = String(m.mz_key || '').replace(/^.*_sl/i, '');
      if (!key || said[key] || items[key] || m.source !== 'agent' || m.ext_id || hasMentions[m.id] || inCart[m.id]) return;
      var others = Object.keys(mzFirsts_(m.mz_first)).filter(function (k) { return k !== agent.name; });
      if (others.length || names_(m.mentioned).some(function (n) { return n !== agent.name; })) return;
      if (m.review !== 'new' || m.category || m.action || m.notes || m.outcome || m.priority_override || String(m.urgent) === '1' || m.assigned_to) return;
      removed.push(m.id);
    });
    if (removed.length) {
      deleteRows_('Mizito', removed);
      var gone = {};
      removed.forEach(function (id) { gone[id] = 1; });
      deleteRows_('MizitoComments', (data.MizitoComments || []).filter(function (c) { return gone[c.item_id]; }).map(function (c) { return c.id; }));
    }
  }

  var rows = Object.keys(items).map(function (k) { return items[k]; });
  writeRows_('Mizito', rows);
  writeRows_('MizitoMentions', mentions);
  writeRows_('MizitoComments', notes);
  try { historyRows_(hist, MZ_AGENT); } catch (e) {}
  var st = mzStatus_(agent.name);
  if (body.error && !(body.items || []).length) {
    // a failed run: shown next to the person's name, but the next read still starts from the last good one
    mzSetStatus_(agent.name, { error: String(body.error).slice(0, 300), error_at: now, version: String(body.version || '') });
    return { made: 0, updated: 0, mentions: 0, comments: 0, gone: 0 };
  }
  var patch = { at: now, version: String(body.version || ''), error: '' };
  if (body.final) {
    patch.done_at = now;
    patch.run = body.stats || {};
    patch.full = body.full ? now : st.full || '';
    patch.link = String(body.link || '');
    patch.link_how = String(body.link_how || '').slice(0, 300);
  }
  mzSetStatus_(agent.name, patch);
  return { made: made, updated: updated, mentions: mentions.length, comments: notes.length, gone: gone, removed: removed.length };
}

var MZ_AGENT_FIELDS = ['mz_again', 'mz_state', 'mz_done_at', 'mz_done_by', 'mz_progress', 'mz_project', 'mz_owner', 'mz_assignees', 'mz_labels', 'mz_checklist', 'mz_deadline', 'mz_last_by', 'mz_last_at', 'synced_at', 'mz_change', 'mz_changed_at', 'mz_first', 'mz_link_ok', 'mz_chat', 'last_mention_at', 'last_mention_by', 'received_at', 'mentioned'];
/**
 * A save from a page that loaded before the agent's last read must not take the agent's newer facts
 * back: those fields keep the sheet's values, and the task is read in full again (sig cleared) so
 * Mizito's open/done is re-applied over a status that may be stale.
 */
function mzKeepAgentFields_(before, row) {
  if (!before.synced_at || String(row.synced_at || '') >= String(before.synced_at)) return row;
  var out = {};
  for (var k in row) out[k] = row[k];
  MZ_AGENT_FIELDS.forEach(function (f) { if (f in before) out[f] = before[f]; });
  out.mz_sig = '';
  return out;
}

/** Emails a person their cartable once it is sent (what to act on, with the link to the app). */
function mailCartable_(owner, box, period, user) {
  if (user.access !== 'super' && user.access !== 'exec') throw new Error('دسترسی ندارید');
  var data = rawAll_();
  var m = (data.Team || []).filter(function (x) { return x.name === owner; })[0];
  if (!m || !m.email) return { sent: false, reason: 'ایمیلی برای ' + owner + ' ثبت نشده' };
  var items = (data.Cartable || []).filter(function (c) { return c.owner === owner && c.box === box && c.status === 'sent'; });
  if (!items.length) return { sent: false, reason: 'موردی در کارتابل نیست' };
  var kinds = { approve: 'تأیید', decide: 'تصمیم', reply: 'پاسخ', review: 'بررسی', sign: 'امضا', info: 'جهت اطلاع' };
  var rows = items.map(function (c) {
    return '<li style="margin:6px 0"><b>' + esc_(c.title) + '</b>' + (c.kind ? ' — ' + (kinds[c.kind] || c.kind) : '') + (c.due_date ? ' · مهلت ' + esc_(c.due_date) : '') + (c.ask ? '<br><span style="color:#555">' + esc_(c.ask) + '</span>' : '') + '</li>';
  }).join('');
  var title = (box === 'weekly' ? 'کارتابل آخر هفته' : 'کارتابل امروز') + ' — ' + items.length + ' مورد';
  MailApp.sendEmail({ to: m.email, subject: 'مدار: ' + title, htmlBody: mailBox_('<h3 style="margin:0 0 8px">' + esc_(title) + '</h3>', '<p>' + esc_(user.name) + ' این موارد را برای اقدام شما فرستاده است:</p><ul style="padding-inline-start:18px">' + rows + '</ul>') });
  return { sent: true, count: items.length };
}

/** "name=YYYY-MM-DD HH:mm" lines → { name: time } */
function mzFirsts_(raw) {
  var out = {};
  String(raw || '').split('\n').forEach(function (line) {
    var i = line.lastIndexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return out;
}

/** Removes rows by id (bottom first, so the row numbers stay right). */
function deleteRows_(name, ids) {
  if (!ids || !ids.length) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return;
  var want = {};
  ids.forEach(function (id) { want[String(id)] = 1; });
  var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) if (want[String(col[i][0])]) sh.deleteRow(i + 2);
  bumpVersion_(name);
}

// --------------------------------------------------------------------------
// Starting Mizito over: every Mizito row, mention, comment and change log goes, and each person's
// read status is cleared, so the next read of the agent brings everything back from the cutoff,
// oldest mention first. Row ids are MZ-<Mizito id>, so comments, files and cartable items written
// in Madar find their task again once it is back.
// --------------------------------------------------------------------------

/** Keeps the rows keep() says yes to; returns how many went. One read and one write per tab. */
function keepRows_(name, keep) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return 0;
  var n = sh.getLastRow() - 1, w = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, w).getValues()[0].map(String);
  var range = sh.getRange(2, 1, n, w);
  var vals = range.getValues();
  var kept = vals.filter(function (r) {
    if (r[0] === '' || r[0] === null) return false;
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i]; });
    return keep(o);
  });
  var gone = vals.filter(function (r) { return r[0] !== '' && r[0] !== null; }).length - kept.length;
  if (!gone) return 0;
  range.clearContent();
  // text stays text (a written "2026-10-19" or "1405" would otherwise turn into a date or a number)
  var text = kept.map(function (r) { return r.map(function (v) { return typeof v === 'string' && v !== '' ? "'" + v : v; }); });
  if (kept.length) sh.getRange(2, 1, kept.length, w).setValues(text);
  bumpVersion_(name);
  return gone;
}

function mzReset_(user) {
  // nothing may refill Mizito behind the person's back: old agent keys and server-read leftovers go
  try {
    PropertiesService.getScriptProperties().deleteProperty('MZ_AGENTS');
    PropertiesService.getScriptProperties().deleteProperty('MZ_TOKENS');
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mzServerSyncAll') ScriptApp.deleteTrigger(t); });
  } catch (eOld) {}
  var none = function () { return false; };
  var out = {
    items: keepRows_('Mizito', none),
    mentions: keepRows_('MizitoMentions', none),
    comments: keepRows_('MizitoComments', none),
    history: keepRows_('History', function (h) { return h.entity !== 'Mizito' && h.entity !== 'MizitoMentions'; }),
  };
  // each person's read starts over; the key and the server connection stay
  (rawAll_().Config || []).forEach(function (c) {
    var id = String(c.id);
    if (id.indexOf('mz.agent.') !== 0 || id === 'mz.agent.cutoff') return;
    var st = {};
    try { st = JSON.parse(c.value) || {}; } catch (e) {}
    var keep = {};
    ['key_at', 'revoked'].forEach(function (k) { if (st[k]) keep[k] = st[k]; });
    keep.reset_at = mzNow_();
    try { CacheService.getScriptCache().put('mzb.gen', stamp_(), 21600); } catch (eGen) {}
    upsert_('Config', { id: id, value: JSON.stringify(keep) }, MZ_AGENT);
  });
  log_(user || MZ_AGENT, 'mizito reset', 'Mizito', JSON.stringify(out));
  return out;
}

// --------------------------------------------------------------------------
// Import: what Claude (in Chrome, on the Mizito page) read from the «دستیار میزیتو» chat, pasted in
// Madar and turned into the same items the agent sends (src/lib/mzImport.ts). The tasks go in under
// the person whose Mizito it was read in, merged by Mizito id; ids of mentions and comments come from
// their content, so importing the same thing again adds nothing twice.
// --------------------------------------------------------------------------
function mzImport_(body, user) {
  var account = String(body.account || user.name);
  var m = (rawAll_().Team || []).filter(function (x) { return x.name === account; })[0];
  if (!m || (m.access !== 'super' && m.access !== 'exec')) throw new Error('ایمپورت میزیتو فقط به نام مدیر برنامه یا CPTO است');
  // a batch already applied (a retry after a lost answer, a double click) is not applied again
  var cache = CacheService.getScriptCache();
  var bkey = body.batch ? 'mzb.' + (cache.get('mzb.gen') || '0') + '.' + String(body.batch).slice(0, 120) : '';
  if (bkey) {
    var done = cache.get(bkey);
    if (done) { try { return JSON.parse(done); } catch (eDone) {} }
  }
  var items = (body.items || []).filter(function (t) { return t && t.key && t.title; });
  // the same task already in Madar under another key (an older import, or the agent): same row
  var have = {}, byTitle = {};
  (rawAll_().Mizito || []).forEach(function (r) {
    var k = String(r.mz_key || '').replace(/^.*_sl/i, '');
    if (!k) return;
    have[k] = 1;
    var tk = mzTitleKey_(r.title);
    if (tk) (byTitle[tk] = byTitle[tk] || []).push(r);
  });
  var linkKey = function (l) { var x = /_sl([0-9a-f]{24})/i.exec(String(l || '')); return x ? x[1].toLowerCase() : ''; };
  items.forEach(function (t) {
    // a file from the reader carries Mizito's own ids: matched by id only, never by title
    if (body.exact || have[String(t.key)]) return;
    var lk = linkKey(t.link);
    var same = (byTitle[mzTitleKey_(t.title)] || []).filter(function (r) { var rk = linkKey(r.link); return !(lk && rk && rk !== lk); });
    if (same.length) t.key = String(same[0].mz_key).replace(/^.*_sl/i, '');
  });
  var r = mzIngest_({ items: items, version: 'import' }, { name: account });
  if (body.last) {
    var patch = { done_at: mzNow_(), via: 'import', run: { tasks: Number(body.total) || items.length } };
    // how far this person's import has got (the next range starts the day after)
    var to = body.range && /^\d{4}-\d{2}-\d{2}$/.test(String(body.range.to)) ? String(body.range.to) : '';
    var st = mzStatus_(account);
    if (to && (!st.range_to || to > String(st.range_to))) patch.range_to = to;
    mzSetStatus_(account, patch);
  }
  if (bkey) { try { cache.put(bkey, JSON.stringify(r), 21600); } catch (ePut) {} }
  return r;
}

/** The person wrote the last word on the task, after the latest mention to them: the ball is with the others. */
function mzAnsweredLast_(t, ments, me, ts) {
  if (!t.last_by || t.last_by !== me) return false;
  var lastAsk = ments.reduce(function (a, x) { var at = ts(x.at); return at > a ? at : a; }, '');
  return ts(t.last_at) >= lastAsk;
}

/** Done in Mizito, but someone asked about it after that: still an open ask. */
function mzAskedAfter_(t, ments, ts) {
  var doneAt = ts(t.completed_at);
  if (!doneAt) return false;
  return ments.some(function (x) { return ts(x.at) > doneAt; });
}

/** Links for tasks Madar already has ({key, link}); a link never creates a task. */
function mzLinks_(links, user) {
  var byKey = {};
  (rawAll_().Mizito || []).forEach(function (m) { if (m.mz_key) byKey[String(m.mz_key).replace(/^.*_sl/i, '')] = m; });
  var rows = [], hist = [], missing = 0;
  links.forEach(function (x) {
    var m = x && byKey[String(x.key || '')];
    var link = String((x && x.link) || '').trim();
    if (!m || !/^https?:\/\//.test(link)) { missing++; return; }
    if (m.link === link) return;
    var c = {};
    for (var k in m) c[k] = m[k];
    hist.push({ entity: 'Mizito', entity_id: c.id, field: 'link', from: clip_(c.link), to: clip_(link) });
    c.link = link;
    c.mz_link_ok = '1';
    rows.push(c);
  });
  if (rows.length) writeRows_('Mizito', rows);
  try { historyRows_(hist, user); } catch (e) {}
  return { saved: rows.length, missing: missing };
}

/** Same compare key as src/lib/mzImport.ts mzTitleKey: no spaces, half-spaces, punctuation or letter-form differences. */
function mzTitleKey_(s) {
  return String(s || '')
    .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
    .replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا')
    .toLowerCase()
    .replace(/[\s\u200c\u200f\u200e\u00a0.,،:;!?؟«»"'`()[\]{}\-_/\\|*#@…ـ+=<>~^%$&]+/g, '');
}

/** An imported task with fields left empty takes them from its row (Claude did not see them; nothing was removed). */
function mzFill_(t, cur) {
  var o = {};
  for (var k in t) o[k] = t[k];
  if (!cur) {
    if (o.completed === undefined || o.completed === null) o.completed = false;
    return o;
  }
  var none = function (v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); };
  if (o.completed === undefined || o.completed === null) {
    o.completed = cur.mz_state === 'done';
    if (o.completed) { o.completed_at = o.completed_at || cur.mz_done_at || ''; o.completed_by = o.completed_by || cur.mz_done_by || ''; }
  }
  if (none(o.notes)) o.notes = cur.description || '';
  if (none(o.project)) o.project = cur.mz_project || '';
  if (none(o.owner)) o.owner = cur.mz_owner || '';
  if (none(o.assignees)) o.assignees = names_(cur.mz_assignees);
  if (none(o.labels)) o.labels = names_(cur.mz_labels);
  if (none(o.checklist)) o.checklist = String(cur.mz_checklist || '').split('\n').filter(Boolean).map(function (l) { return { t: l.replace(/^[✓○]\s*/, ''), ok: l.charAt(0) === '✓' }; });
  if (none(o.progress)) o.progress = cur.mz_progress === '' || cur.mz_progress === undefined ? undefined : Number(cur.mz_progress);
  if (none(o.deadline) && cur.mz_deadline) o.deadline = String(cur.mz_deadline).slice(0, 10) + 'T00:00:00+03:30';
  return o;
}

/**
 * The same Mizito task in several rows (imports before 2.2, or the agent and an import): one row.
 * Rows are the same task when their titles match (see mzTitleKey_) and they do not carry two different
 * task links. The kept row is the one with the link (else the oldest); it takes the others' facts where
 * it has none, their mentions and Mizito comments, and whatever was written in Madar about them
 * (comments, files, cartable, history). With dry = true it only counts.
 */
function mzDedupe_(dry) {
  var data = rawAll_();
  var linkKey = function (l) { var x = /_sl([0-9a-f]{24})/i.exec(String(l || '')); return x ? x[1].toLowerCase() : ''; };
  var groups = {};
  (data.Mizito || []).forEach(function (m) { var tk = mzTitleKey_(m.title); if (tk) (groups[tk] = groups[tk] || []).push(m); });
  var merges = [];
  Object.keys(groups).forEach(function (tk) {
    var rows = groups[tk];
    if (rows.length < 2) return;
    var links = {};
    rows.forEach(function (m) { var k = linkKey(m.link); if (k) links[k] = 1; });
    rows.sort(function (a, b) { return (linkKey(b.link) ? 1 : 0) - (linkKey(a.link) ? 1 : 0) || (String(a.received_at || '9') < String(b.received_at || '9') ? -1 : 1); });
    merges.push(rows);
  });
  if (dry) return { groups: merges.length, rows: merges.reduce(function (a, g) { return a + g.length - 1; }, 0) };

  var keepRows = [], gone = {}, moveTo = {};
  var madar = ['flag', 'category', 'action', 'priority_override', 'override_reason', 'urgent', 'assigned_to', 'outcome', 'notes', 'docs', 'link', 'description'];
  var mzFacts = ['mz_again', 'mz_project', 'mz_owner', 'mz_assignees', 'mz_labels', 'mz_checklist', 'mz_deadline', 'mz_progress', 'mz_last_by', 'mz_last_at', 'mz_chat'];
  var extra = [];
  merges.forEach(function (rows) {
    var k = {};
    for (var f in rows[0]) k[f] = rows[0][f];
    rows.slice(1).forEach(function (o) {
      gone[o.id] = 1;
      moveTo[o.id] = k.id;
      madar.concat(mzFacts).forEach(function (f) { if ((k[f] === '' || k[f] === undefined) && o[f] !== '' && o[f] !== undefined) k[f] = o[f]; });
      if (String(o.description || '').length > String(k.description || '').length) k.description = o.description;
      k.mentioned = names_(k.mentioned).concat(names_(o.mentioned).filter(function (n) { return names_(k.mentioned).indexOf(n) === -1; })).join(', ');
      var fk = mzFirsts_(k.mz_first), fo = mzFirsts_(o.mz_first);
      Object.keys(fo).forEach(function (n) { if (!fk[n] || fo[n] < fk[n]) fk[n] = fo[n]; });
      k.mz_first = Object.keys(fk).map(function (n) { return n + '=' + fk[n]; }).join('\n');
      // the earlier ask wins; the other row's first mention becomes a mention of this one
      if (o.received_at && String(o.received_at) < String(k.received_at || '9999')) {
        if (k.ext_id) extra.push({ id: 'MM-' + k.ext_id, item_id: k.id, by: k.asked_by, at: k.received_at, note: '', status: '', mz_id: k.ext_id, account: names_(k.mentioned)[0] || '', mz_comment: '' });
        k.received_at = o.received_at; k.asked_by = o.asked_by || k.asked_by; k.ext_id = o.ext_id || k.ext_id;
      } else if (o.ext_id && o.ext_id !== k.ext_id) {
        extra.push({ id: 'MM-' + o.ext_id, item_id: k.id, by: o.asked_by, at: o.received_at, note: '', status: '', mz_id: o.ext_id, account: names_(o.mentioned)[0] || '', mz_comment: '' });
      }
      if (String(o.last_mention_at || '') > String(k.last_mention_at || '')) { k.last_mention_at = o.last_mention_at; k.last_mention_by = o.last_mention_by; }
      // a status set in Madar on the other row (and not on this one) is kept
      if (o.review !== 'new' && k.review === 'new') { k.status = o.status; k.review = o.review; k.closed_at = o.closed_at; }
    });
    k.mz_sig = '';
    keepRows.push(k);
  });
  if (!keepRows.length) return { groups: 0, rows: 0 };

  // mentions and comments of the merged rows: moved, the same one twice kept once
  var seenM = {}, mentions = [], dropM = [];
  (data.MizitoMentions || []).concat(extra).forEach(function (x) {
    var item = moveTo[x.item_id] || x.item_id;
    var sig = item + '|' + mzTitleKey_(x.by) + '|' + String(x.at).slice(0, 16);
    if (seenM[sig] || seenM['id:' + x.id]) { if (!extra.some(function (e) { return e === x; })) dropM.push(x.id); return; }
    seenM[sig] = 1; seenM['id:' + x.id] = 1;
    if (item !== x.item_id || extra.indexOf(x) !== -1) { var y = {}; for (var f in x) y[f] = x[f]; y.item_id = item; mentions.push(y); }
  });
  var seenC = {}, notes = [], dropC = [];
  (data.MizitoComments || []).forEach(function (c) {
    var item = moveTo[c.item_id] || c.item_id;
    var sig = item + '|' + mzTitleKey_(c.by) + '|' + mzTitleKey_(c.body).slice(0, 300);
    if (seenC[sig]) { dropC.push(c.id); return; }
    seenC[sig] = 1;
    if (item !== c.item_id) { var y = {}; for (var f in c) y[f] = c[f]; y.item_id = item; notes.push(y); }
  });
  var repoint = function (sheet, field) {
    var out = [];
    (data[sheet] || []).forEach(function (r) {
      if (r.entity === 'Mizito' && moveTo[r[field]]) { var y = {}; for (var f in r) y[f] = r[f]; y[field] = moveTo[r[field]]; out.push(y); }
    });
    if (out.length) writeRows_(sheet, out);
    return out.length;
  };
  writeRows_('Mizito', keepRows);
  if (mentions.length) writeRows_('MizitoMentions', mentions);
  if (notes.length) writeRows_('MizitoComments', notes);
  repoint('Comments', 'entity_id');
  repoint('Files', 'entity_id');
  repoint('Cartable', 'entity_id');
  repoint('History', 'entity_id');
  deleteRows_('MizitoMentions', dropM);
  deleteRows_('MizitoComments', dropC);
  deleteRows_('Mizito', Object.keys(gone));
  return { groups: keepRows.length, rows: Object.keys(gone).length };
}

// An earlier version read Mizito from the server on a 15-minute trigger; that trigger, if it was
// made, removes itself here.
function mzServerSyncAll() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mzServerSyncAll') ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteProperty('MZ_TOKENS');
}
