/** Client code for the desktop-owned DSH extension. Slot registrations follow
 * their declaring surfaces through mount and disposal, including new sessions. */
export function workbenchBrandClient(avatar: string) {
  return `
  const { jsx, jsxs } = require('react/jsx-runtime');
  const mark = ({ size }) => jsx('img', {
    src: ${JSON.stringify(avatar)}, alt: '', width: size, height: size,
    style: { display: 'block', objectFit: 'contain' },
  });
  // The host header owns the wordmark. Keep DSH's native new-session and
  // collapse controls on a single row when the sidebar is expanded.
  const sidebarLayout = () => jsx('style', {
    className: 'deepchat-sidebar-layout',
    children: [
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) { position: relative; height: 0; padding: 0; margin: 8px 0 0; overflow: visible; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) > :has(.deepchat-sidebar-layout) { display: none; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) [class*="_toggle"] { position: absolute; right: 0; top: 0; height: 38px; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) ~ button[class*="_newSession"] { margin-right: 40px; }',
    ].join(' '),
  });
  const hero = () => jsxs('span', {
    className: 'deepchat-welcome',
    style: { display: 'inline-flex', alignItems: 'center', gap: '0.6em', fontSize: 'clamp(16px, 2.5vw, 24px)' },
    children: [
      jsx('style', { children: '[class$="_headline"]:has(.deepchat-welcome) > [class$="_titleGroup"] { display: none }' }),
      mark({ size: 40 }), jsx('span', { children: '最近在琢磨什么问题？一起聊聊吧。' }),
    ],
  });
  for (const [name, component] of [
    ['sidebar.brand.mark', () => null], ['sidebar.brand.name', sidebarLayout],
    ['conversation.hero.brand.mark', hero],
  ]) {
    ctx.slots.inject(name, function* () {
      yield ctx.slots.register({ name, priority: -1 }, component);
    });
  }
  `;
}
