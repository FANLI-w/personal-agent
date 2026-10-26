import { useEffect, useRef, useState } from 'react';
import { useResearchStore } from './store';
import { readContactServiceOrigin } from './contact-card';
import { readContactStars, starStorageKey, writeContactStar } from './contact-directory';

export function useContactStars() {
  const actorId = useResearchStore(s => s.actor?.member.id);
  const generation = useResearchStore(s => s.generation);
  const scope = `${generation}:${actorId}`;
  const current = useRef(scope); current.current = scope;
  const [saved, setSaved] = useState<{ scope: string; key: string; ids: string[] }>();
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  useEffect(() => {
    let active = true;
    const isCurrent = () => active && current.current === scope && useResearchStore.getState().generation === generation && useResearchStore.getState().actor?.member.id === actorId;
    if (actorId) void (async () => {
      try {
        const service = await readContactServiceOrigin();
        if (!isCurrent()) return;
        const key = starStorageKey(service, actorId), ids = readContactStars(localStorage, key);
        if (isCurrent()) { setSaved({ scope, key, ids }); setFailure(undefined); }
      } catch { if (isCurrent()) setFailure({ scope, message: '本机星标暂时无法读取，其他通讯录功能仍可使用。' }); }
    })();
    return () => { active = false; };
  }, [scope, actorId, generation]);
  const state = saved?.scope === scope ? saved : undefined;
  useEffect(() => {
    if (!state) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== state.key || current.current !== scope) return;
      try { setSaved({ ...state, ids: readContactStars(localStorage, state.key) }); setFailure(undefined); }
      catch { setFailure({ scope, message: '本机星标暂时无法读取。' }); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [state?.key, scope]);
  return {
    ids: state?.ids || [], error: failure?.scope === scope ? failure.message : '',
    toggle: async (id: string) => {
      if (!state || current.current !== scope || useResearchStore.getState().generation !== generation || useResearchStore.getState().actor?.member.id !== actorId) throw new Error('星标尚未准备好，请稍后重试。');
      try {
        const latest = readContactStars(localStorage, state.key);
        const ids = writeContactStar(localStorage, state.key, id, !latest.includes(id));
        setSaved({ ...state, ids }); setFailure(undefined);
      } catch { throw new Error('星标未能保存，请检查本机存储后重试。'); }
    },
  };
}
