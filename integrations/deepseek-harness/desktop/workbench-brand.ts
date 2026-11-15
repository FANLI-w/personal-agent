/** Client code for the desktop-owned DSH extension. Slot registrations follow
 * their declaring surfaces through mount and disposal, including new sessions. */
export function workbenchBrandClient(avatar: string) {
  return `
  const { jsx, jsxs } = require('react/jsx-runtime');
  const mark = ({ size }) => jsx('img', {
    src: ${JSON.stringify(avatar)}, alt: '', width: size, height: size,
    style: { display: 'block', objectFit: 'contain' },
  });
  const wordmark = () => jsx('strong', {
    children: 'deepchat', style: { fontSize: '16px', letterSpacing: '-0.025em' },
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
    ['sidebar.brand.mark', mark], ['sidebar.brand.name', wordmark],
    ['conversation.hero.brand.mark', hero],
  ]) {
    ctx.slots.inject(name, function* () {
      yield ctx.slots.register({ name, priority: -1 }, component);
    });
  }
  `;
}
