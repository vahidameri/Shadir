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

var MADAR_VERSION = '1.6.0'; // shown on the login page and by diagnose()

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
    'source', 'review', 'mz_state', 'mz_done_at', 'mz_done_by', 'mz_progress', 'mz_project', 'mz_owner', 'mz_assignees', 'mz_labels', 'mz_checklist', 'mz_deadline', 'mz_last_by', 'mz_last_at', 'mz_sig', 'synced_at'],
  // account = whose Mizito the agent read it in; mz_id = the mention's id there, mz_comment = the comment that mentioned
  MizitoMentions: ['id', 'item_id', 'by', 'at', 'note', 'status', 'batch', 'mz_id', 'account', 'mz_comment'],
  // the conversation on a Mizito task, as the agent read it (one row per Mizito comment)
  MizitoComments: ['id', 'item_id', 'by', 'at', 'body', 'mentions', 'reply_to', 'files', 'batch'],
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
var DATE_COLS = ['start_date', 'end_date', 'planned_date', 'actual_date', 'due_date', 'created_at', 'completed_at', 'done_at', 'week_date', 'date', 'target_date', 'baseline_date', 'delivered_date', 'time', 'deadline', 'handoff_date', 'test_date', 'follow_date', 'last_delivery', 'archived_at', 'sent_at', 'responded_at', 'week', 'assigned_at', 'blocked_since', 'updated_at', 'received_at', 'last_mention_at', 'closed_at', 'at', 'last_ping', 'started_at', 'baseline_end', 'mz_done_at', 'mz_deadline', 'mz_last_at', 'synced_at'];

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
    if (action === 'all') return json_({ ok: true, user: me, data: readAll_(user), version: MADAR_VERSION });
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
    if (body.action === 'mzHello' || body.action === 'mzIngest') {
      var agent = mzAgent_(body.agent);
      if (body.action === 'mzHello') return json_({ ok: true, row: mzHello_(agent) });
      lock.waitLock(30000);
      return json_({ ok: true, row: mzIngest_(body, agent) });
    }
    var user = auth_(body);
    if (body.action === 'mzAgentKey' || body.action === 'mzAgentRevoke') {
      if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند کلید ایجنت بسازد');
      lock.waitLock(20000);
      return json_({ ok: true, row: body.action === 'mzAgentKey' ? mzAgentKey_(body.name) : mzAgentRevoke_(body.name) });
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
    else if (body.action === 'syncMeeting') result = syncMeeting_(body.meeting_id, user);
    else {
      if (!SCHEMA[body.sheet]) throw new Error('Unknown sheet: ' + body.sheet);
            guardPrivate_(body.sheet, body.action === 'delete' ? { id: body.id } : body.row, user);
      guardWrite_(body.sheet, body.action === 'delete' ? existingRow_(body.sheet, body.id) : body.row, user);
      if (body.sheet === 'History') throw new Error('سابقه‌ی تغییرات فقط خودکار ثبت می‌شود');
      var logged = !!HISTORY_FIELDS[body.sheet];
      var before = (body.action === 'upsert' && (body.sheet === 'Tasks' || logged)) ? existingRow_(body.sheet, body.row.id) : null;
      if (body.action === 'upsert') {
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
  var out = JSON.parse(JSON.stringify(rawAll_()));
  delete out[USERS_SHEET];
  return user ? applyPrivacy_(out, user) : out;
}

// --------------------------------------------------------------------------
// Speed: the whole sheet is cached (gzip, in chunks) and re-read only after a write.
// Every write bumps the version, so a cached copy is never served after a change.
// Edits made directly in the Sheet bump it too (onEdit); the cache also expires after 10 min.
// --------------------------------------------------------------------------

var CACHE_TTL = 600;
var RAW_ = null; // per-request memo

function cacheVer_() {
  var c = CacheService.getScriptCache();
  var v = c.get('atlas.ver');
  if (!v) {
    v = String(Date.now());
    c.put('atlas.ver', v, 21600);
  }
  return v;
}

function bumpVersion_() {
  RAW_ = null;
  CacheService.getScriptCache().put('atlas.ver', Date.now() + '.' + Math.random().toString(36).slice(2, 7), 21600);
}

function rawAll_() {
  if (RAW_) return RAW_;
  var c = CacheService.getScriptCache();
  var base = 'atlas.all.' + cacheVer_();
  var n = Number(c.get(base) || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(base + '.' + i);
    var parts = c.getAll(keys);
    if (Object.keys(parts).length === n) {
      try {
        var bytes = Utilities.base64Decode(keys.map(function (k) { return parts[k]; }).join(''));
        RAW_ = JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString());
        return RAW_;
      } catch (e) {}
    }
  }
  var ss = SpreadsheetApp.getActive();
  var out = {};
  Object.keys(SCHEMA).concat([USERS_SHEET]).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    out[name] = sh ? readSheet_(sh) : [];
  });
  RAW_ = out;
  try {
    var s = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(out), 'application/json')).getBytes());
    var size = 90000;
    var count = Math.ceil(s.length / size);
    if (count <= 40) {
      var chunks = {};
      for (var j = 0; j < count; j++) chunks[base + '.' + j] = s.slice(j * size, (j + 1) * size);
      c.putAll(chunks, CACHE_TTL);
      c.put(base, String(count), CACHE_TTL);
    }
  } catch (e) {}
  return RAW_;
}

/** Simple trigger: a manual edit in the Sheet invalidates the cache. */
function onEdit() {
  try { bumpVersion_(); } catch (e) {}
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
  if ((sheet === 'Mizito' || sheet === 'MizitoMentions' || sheet === 'MizitoComments' || sheet === 'Contacts') && a !== 'super' && a !== 'exec') throw new Error('این بخش فقط برای CPTO و مدیر برنامه است');
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
    bumpVersion_();
  } else {
    sh.appendRow(values);
    log_(user, 'create', name, row.id);
    if (name === 'Comments') notifyMentions_(row, user);
    bumpVersion_();
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
    bumpVersion_();
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
    return ['H' + Date.now().toString(36) + i, r.entity, r.entity_id, r.field, t(r.from), t(r.to), user.name, "'" + at];
  });
  sh.getRange(sh.getLastRow() + 1, 1, vals.length, SCHEMA.History.length).setValues(vals);
  bumpVersion_();
}

// --------------------------------------------------------------------------
// Import — the back office brings rows from old sheets in one go (program manager only).
// Every imported row carries a batch id, so a whole import can be taken back.
// --------------------------------------------------------------------------

var BULK_SHEETS = { Tasks: 1, FollowUps: 1, Mizito: 1, MizitoMentions: 1, MizitoComments: 1, Contacts: 1, Team: 1, Projects: 1, History: 1, Comments: 1, Allocations: 1, Objectives: 1, KeyResults: 1, Kpis: 1, Checkins: 1, Sprints: 1, Plans: 1 };

function bulk_(name, rows, user) {
  if (user.access !== 'super') throw new Error('فقط مدیر برنامه می‌تواند ایمپورت کند');
  if (!BULK_SHEETS[name]) throw new Error('این تب قابل ایمپورت نیست: ' + name);
  rows = (rows || []).filter(function (r) { return r && r.id; });
  if (!rows.length) return { count: 0 };
  writeRows_(name, rows);
  log_(user, 'import ' + rows.length, name, rows[0].batch || '');
  bumpVersion_();
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
  bumpVersion_();
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
  (rawAll_().Mizito || []).forEach(function (m) { if (m.mz_key) known[String(m.mz_key)] = names_(m.mentioned).indexOf(agent.name) !== -1 ? String(m.mz_sig || '') : ''; });
  var st = mzStatus_(agent.name);
  return { account: agent.name, cutoff: setting_('mz.agent.cutoff', MZ_CUTOFF), last: st.at || '', known: known, version: MADAR_VERSION };
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
  (data.Mizito || []).forEach(function (m) { if (m.mz_key) byKey[String(m.mz_key)] = m; });
  var mentionIds = {};
  (data.MizitoMentions || []).forEach(function (x) { if (x.mz_id) mentionIds[String(x.mz_id)] = 1; });
  var comments = {};
  (data.MizitoComments || []).forEach(function (c) { comments[String(c.id)] = c; });

  var items = {}, mentions = [], notes = [], hist = [];
  var made = 0, updated = 0;
  var log = function (m, field, from, to) { if (String(from) !== String(to)) hist.push({ entity: 'Mizito', entity_id: m.id, field: field, from: clip_(from), to: clip_(to) }); };

  (body.items || []).forEach(function (t) {
    if (!t || !t.key) return;
    var key = String(t.key);
    var cur = items[key] || byKey[key];
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
        asked_by: first ? first.by : t.owner || '', mentioned: agent.name, category: '', action: '',
        status: t.completed ? firstOf('done') : t.last_by && t.last_by === agent.name ? firstOf('waiting') : firstOf('open'),
        priority_override: '', override_reason: '', urgent: '', assigned_to: '', due_date: ts(t.deadline).slice(0, 10),
        received_at: first ? ts(first.at) : ts(t.created_at) || now, last_mention_at: '', last_mention_by: '',
        outcome: '', notes: '', created_at: now.slice(0, 10), updated_at: now, closed_at: '', ext_id: first ? String(first.id) : '',
        source: 'agent', review: t.completed ? '' : 'new', mz_state: '', mz_deadline: ts(t.deadline).slice(0, 10),
      };
      m.last_mention_at = m.received_at;
      m.last_mention_by = m.asked_by;
      if (t.completed) m.closed_at = ts(t.completed_at) || now;
      hist.push({ entity: 'Mizito', entity_id: m.id, field: '_created', from: '', to: m.status });
      made++;
    }
    if (!listed(m.mentioned, agent.name)) m.mentioned = names_(m.mentioned).concat([agent.name]).join(', ');

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
      if (!m.description && t.notes) m.description = long(t.notes);
      if (!m.link && t.link) m.link = t.link;
      m.mz_project = t.project || '';
      m.mz_owner = t.owner || '';
      m.mz_assignees = (t.assignees || []).join(', ');
      m.mz_labels = (t.labels || []).join(', ');
      m.mz_checklist = long((t.checklist || []).map(function (c) { return (c.ok ? '✓ ' : '○ ') + c.t; }).join('\n'), 2000);
      m.mz_progress = t.progress === undefined || t.progress === null ? '' : t.progress;
      if (t.last_at) {
        m.mz_last_at = ts(t.last_at);
        m.mz_last_by = t.last_by || '';
        // a task that came without a mention (just assigned): someone else's latest word is the ask
        if (!m.ext_id && m.source === 'agent' && m.mz_last_by && !listed(m.mentioned, m.mz_last_by) && m.mz_last_at > String(m.last_mention_at || '')) {
          m.last_mention_at = m.mz_last_at;
          m.last_mention_by = m.mz_last_by;
        }
      }
      var was = String(m.mz_state || '');
      m.mz_state = t.completed ? 'done' : 'open';
      m.mz_done_at = t.completed ? ts(t.completed_at) : '';
      m.mz_done_by = t.completed ? t.completed_by || '' : '';
      // Mizito decides whether it is open or done (an item set aside in Madar stays aside)
      var cat = catOf(m.status);
      if (cur && m.review !== 'ignored') {
        if (t.completed && cat !== 'done' && cat !== 'cancelled') {
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

    ments.forEach(function (x) {
      var id = String(x.id);
      if (mentionIds[id] || id === String(m.ext_id || '')) return;
      mentionIds[id] = 1;
      var at = ts(x.at);
      mentions.push({ id: 'MM-' + id, item_id: m.id, by: x.by || '', at: at, note: '', status: '', mz_id: id, account: agent.name, mz_comment: x.comment || '' });
      if (at > String(m.last_mention_at || '')) { m.last_mention_at = at; m.last_mention_by = x.by || ''; }
      if (at < String(m.received_at || '9999')) m.received_at = at;
    });

    (t.comments || []).forEach(function (c) {
      if (!c || !c.id) return;
      var row = { id: 'MC-' + c.id, item_id: m.id, by: c.by || '', at: ts(c.at), body: long(c.body), mentions: (c.mentions || []).join(', '), reply_to: c.reply_to ? 'MC-' + c.reply_to : '', files: long((c.files || []).join('\n'), 1000) };
      var old = comments[row.id];
      if (old && String(old.body) === row.body && String(old.files || '') === row.files && String(old.mentions || '') === row.mentions) return;
      comments[row.id] = row;
      notes.push(row);
    });

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
      if (!key || seen[key] || items[key] || m.mz_state !== 'open' || !listed(m.mentioned, agent.name)) return;
      var c = {};
      for (var k in m) c[k] = m[k];
      c.mz_state = 'gone';
      c.synced_at = now;
      items[key] = c;
      gone++;
    });
  }

  var rows = Object.keys(items).map(function (k) { return items[k]; });
  writeRows_('Mizito', rows);
  writeRows_('MizitoMentions', mentions);
  writeRows_('MizitoComments', notes);
  try { historyRows_(hist, MZ_AGENT); } catch (e) {}
  var st = mzStatus_(agent.name);
  var patch = { at: now, version: String(body.version || ''), error: String(body.error || '').slice(0, 300) };
  if (body.final) {
    patch.done_at = now;
    patch.run = body.stats || {};
    patch.full = body.full ? now : st.full || '';
  }
  mzSetStatus_(agent.name, patch);
  return { made: made, updated: updated, mentions: mentions.length, comments: notes.length, gone: gone };
}
