/* online.js — WebSocket-клиент. Защищает лобби от устаревших start-сообщений. */
const Online = (() => {
  let ws = null, handlers = {}, session = 0;
  const open = () => new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve();
    if (!ONLINE_URL) return reject(new Error('not-configured'));
    const mySession = ++session;
    let settled = false;
    const fail = err => { if (settled) return; settled = true; try { ws && ws.close(); } catch (_) {} reject(err); };
    try { ws = new WebSocket(ONLINE_URL); } catch (e) { return fail(e); }
    const timer = setTimeout(() => fail(new Error('timeout')), 8000);
    ws.onopen = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    ws.onerror = () => fail(new Error('connect'));
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.session && m.session !== mySession && handlers.message) return;
      if (handlers.message) handlers.message(m);
    };
    ws.onclose = () => { clearTimeout(timer); if (handlers.close) handlers.close(); };
  });
  const send = m => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  const close = () => { handlers = {}; session++; if (ws) { try { ws.close(); } catch (_) {} } ws = null; };
  const on = h => { handlers = h || {}; };
  return { open, send, close, on, available: () => !!ONLINE_URL };
})();
