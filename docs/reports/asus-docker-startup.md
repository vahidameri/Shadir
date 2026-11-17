# ASUS Docker startup and recovery

2026-11-17. The existing Windows automatic sign-in and Docker Desktop logon task start Docker in its existing user session. The ASUS Docker Keepalive scheduled task runs every two minutes in that same session. It starts Docker Desktop if the app is absent and starts stopped or created containers whose restart policy is `always` or `unless-stopped`. For planned stops, disable the keepalive task before stopping Docker or a managed container.

The existing logon task had run since the current Windows boot. The new task returned result 0 and recovered the previously stopped database container. All 11 existing containers were running with a restart policy, the recovered database accepted connections, and both application origins and the public Madar health endpoint returned healthy. Windows was not rebooted as part of this task.

The offline deploy graph was rebuilt and queried (54 nodes, 59 edges). The optional SQL parser remained unavailable.
