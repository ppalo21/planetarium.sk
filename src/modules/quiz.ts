import * as THREE from 'three';
import { ctx } from '../core/context';
import { T } from '../core/i18n';
import { SND } from '../core/sound';
import { setHud } from '../core/ui3d';
import { textSprite, setSpriteH } from '../core/util';
import { quizFinished } from '../core/app';

/** Kvíz: otázky z content/quiz.json, na konci diplom na vytlačenie (na PC). */
export const quiz: any = {
  stars: true,
  build() { this.root = new THREE.Group(); ctx.anchor.add(this.root); const q = textSprite('?', '#ffb46b', 200, 700); setSpriteH(q, 0.5); q.position.set(0, 0.25, -2.2); this.root.add(q); this.qs = q; },
  enter() { this.root.visible = true; this.i = 0; this.score = 0; this.answered = null; this.hud(); },
  exit() { this.root.visible = false; },
  answer(k: number) { if (this.answered != null) return; this.answered = k; if (k === ctx.content.quiz[this.i].a) { this.score++; SND.good(); } else SND.bad(); this.hud(); },
  next() { this.i++; this.answered = null; if (this.i >= ctx.content.quiz.length) quizFinished(this.score, ctx.content.quiz.length); this.hud(); },
  hud() {
    const Q = ctx.content.quiz, UI = ctx.content.ui;
    if (this.i >= Q.length) {
      const s = this.score, n = Q.length;
      setHud({ kicker: { sk: 'Kvíz', en: 'Quiz' }, title: { sk: `Výsledok: ${s} z ${n}`, en: `Score: ${s} of ${n}` },
        body: s === n ? { sk: 'Perfektné! Ste skutočný astronóm. O diplom požiadajte obsluhu.', en: 'Perfect! You are a real astronomer. Ask the staff for your certificate.' }
          : { sk: 'Výborne! O diplom požiadajte obsluhu. Chcete to skúsiť ešte raz?', en: 'Well done! Ask the staff for your certificate. Try again?' },
        rows: [[{ label: T(UI.again), onClick: () => this.enter(), primary: true }]] });
      return;
    }
    const q = Q[this.i], a = this.answered;
    const opt = (k: number) => ({ label: T(q.o[k]), onClick: () => this.answer(k), tone: a == null ? null : (k === q.a ? 'good' : (k === a ? 'bad' : null)) as any });
    const rows: any[] = [[opt(0), opt(1)], [opt(2), opt(3)]];
    if (a != null) rows.push([{ label: T(UI.next) + ' ›', onClick: () => this.next(), primary: true }, { label: T(UI.home), onClick: ctx.goHome }]);
    setHud({ kicker: { sk: `Kvíz   otázka ${this.i + 1} z ${Q.length}`, en: `Quiz   question ${this.i + 1} of ${Q.length}` }, title: q.q,
      body: a == null ? { sk: 'Ukážte na odpoveď a štipnite.', en: 'Point at an answer and pinch.' } : (a === q.a ? { sk: 'Správne!', en: 'Correct!' } : { sk: 'Tentoraz nie. Správna odpoveď je zelená.', en: 'Not this time. The correct answer is green.' }),
      rows, home: a == null });
  },
  relabel() { if (ctx.current === 'quiz') this.hud(); },
  update(_dt: number, t: number) { this.qs.position.y = 0.25 + Math.sin(t * 1.2) * 0.03; }
};
