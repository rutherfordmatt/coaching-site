/*
 * The Clarity Check: the question and result screens.
 *
 * The landing page is static HTML. This script swaps it for one question at a
 * time, then the result, which clarity-check-scoring.js (window.ClarityCheck)
 * builds from the answers. Wording comes from the JSON embedded in the page,
 * always through ClarityCheck.questionFor() and buildResult(), which word
 * questions and results for the visitor's group.
 *
 * Nothing leaves the browser except the Umami events in track(), and those
 * carry ids only. Written answers are kept in sessionStorage and on screen,
 * and never sent anywhere.
 */
(function () {
    'use strict';

    const dataEl = document.getElementById('cc-data');
    const app = document.getElementById('cc-app');
    const landing = document.getElementById('cc-landing');
    if (!dataEl || !app || !landing || !window.ClarityCheck) return;

    const data = JSON.parse(dataEl.textContent);
    const content = data.content;
    const L = content.labels;
    const questions = content.questions;
    const LANDING = -1;
    const RESULT = questions.length;
    const KEY = 'clarity-check';

    // ─── State: which screen, the answers, and how far this run has got ───

    const fresh = () => ({ step: LANDING, max: LANDING, via: null, answers: {}, texts: {}, doneAt: null });

    function load() {
        try {
            const s = JSON.parse(sessionStorage.getItem(KEY));
            if (s && typeof s.step === 'number' && s.answers && s.texts) return s;
        } catch (e) { /* storage blocked or empty */ }
        return fresh();
    }

    function save() {
        try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
    }

    const CC = window.ClarityCheck;
    const questionFor = (id) => CC.questionFor(content, id, state.answers);
    const group = () => CC.groupOf(content, state.answers) || 'none';

    // A change of situation can change a question's options. Drop any saved
    // answer that is no longer on offer, so nothing stale shows as selected.
    function pruneAnswers() {
        questions.forEach((q) => {
            const chosen = state.answers[q.id];
            if (q.type !== 'choice' || q.id === 'situation' || chosen == null) return;
            if (!questionFor(q.id).options.some((o) => o.id === chosen)) delete state.answers[q.id];
        });
    }

    let state = load();
    state.step = Math.min(Math.max(state.step, LANDING), Math.min(state.max, RESULT));
    // A situation saved by an earlier build that no longer exists counts as
    // none chosen. Anyone past question 1 goes back to it to choose again.
    if (state.answers.situation != null && !content.situations.some((s) => s.id === state.answers.situation)) {
        delete state.answers.situation;
        if (state.step > 0) state.step = 0;
    }
    pruneAnswers();
    save();

    // ─── Analytics: ids only, never wording, never written answers ───

    function track(name, payload) {
        try {
            if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, payload);
        } catch (e) { /* tracker blocked or broken */ }
    }

    // ─── Browser history: each screen is one entry, so Back steps back ───
    // Each entry records its screen and its position in this visit, so the
    // on-page Back button can use history.back() whenever there is an entry
    // of ours to go back to, and falls back to a plain step otherwise.

    let position = 0;

    function go(step) {
        state.step = step;
        state.max = Math.max(state.max, step);
        save();
        position++;
        history.pushState({ cc: step, pos: position }, '');
        render(true);
    }

    function back() {
        if (position > 0) {
            history.back();
            return;
        }
        let step = state.step - 1;
        if (state.step === 1 && state.via === 'tile') step = LANDING;
        state.step = step;
        save();
        history.replaceState({ cc: step, pos: 0 }, '');
        render(true);
    }

    window.addEventListener('popstate', (e) => {
        const s = e.state && typeof e.state.cc === 'number' ? e.state : { cc: LANDING, pos: 0 };
        position = s.pos;
        // After Start again, older entries can point past where this run has got.
        state.step = s.cc > state.max ? LANDING : s.cc;
        save();
        render(true);
    });

    // ─── Text helpers ───

    function esc(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // **word** becomes bold; everything else is escaped.
    function rich(s) {
        return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    function fill(template, key, html) {
        return esc(template).replace('{' + key + '}', html);
    }

    function withParams(url, params) {
        if (!/^https?:/.test(url)) return url;
        const u = new URL(url);
        Object.keys(params).forEach((k) => { if (params[k]) u.searchParams.set(k, params[k]); });
        return u.toString();
    }

    const byId = (list, id) => list.find((x) => x.id === id) || null;

    // ─── Screens ───

    function render(moveFocus) {
        const onLanding = state.step === LANDING;
        landing.hidden = !onLanding;
        app.hidden = onLanding;
        document.body.classList.toggle('cc-running', !onLanding);

        let heading;
        if (onLanding) {
            app.innerHTML = '';
            heading = document.getElementById('cc-title');
        } else if (state.step >= RESULT) {
            heading = renderResult();
        } else {
            heading = renderQuestion(questions[state.step], state.step);
        }

        if (moveFocus) {
            try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus({ preventScroll: true });
            }
        }
    }

    function progressHTML(q, i) {
        const pct = Math.round(((i + 1) / questions.length) * 100);
        return `
            <div class="cc-progress">
                <p class="cc-progress-text"><span>${esc(content.parts[q.part])}</span><span>Question ${i + 1} of ${questions.length}</span></p>
                <div class="cc-bar" aria-hidden="true"><span style="width: ${pct}%"></span></div>
            </div>`;
    }

    function renderQuestion(base, i) {
        const q = questionFor(base.id);
        const helper = q.helper ? `<p class="cc-helper" id="cc-helper">${esc(q.helper)}</p>` : '';
        let body;

        if (q.type === 'choice') {
            const chosen = state.answers[q.id];
            body = `<div class="cc-options" role="group" aria-labelledby="cc-q">` + q.options.map((o) => `
                <button type="button" class="cc-option" data-option="${esc(o.id)}" aria-pressed="${o.id === chosen}">
                    <span class="cc-option-label">${esc(o.label)}</span>${o.blurb ? `<span class="cc-option-blurb">${esc(o.blurb)}</span>` : ''}
                </button>`).join('') + `</div>`;
        } else {
            body = `
                <label class="cc-text-label" for="cc-text">Your answer</label>
                <textarea id="cc-text" class="cc-textarea" rows="4"${q.helper ? ' aria-describedby="cc-helper"' : ''}>${esc(state.texts[q.id] || '')}</textarea>
                <div class="cc-text-actions">
                    <button type="button" class="btn btn-primary" data-cc-next>${esc(L.next)}</button>
                    <button type="button" class="btn btn-outline" data-cc-skip>${esc(L.skip)}</button>
                </div>`;
        }

        app.innerHTML = `
            <section class="cc-screen" aria-labelledby="cc-q">
                <div class="cc-inner">
                    ${progressHTML(q, i)}
                    <h2 class="cc-q" id="cc-q">${esc(q.prompt)}</h2>
                    ${helper}
                    ${body}
                    <button type="button" class="cc-back" data-cc-back><span aria-hidden="true">&larr;</span>${esc(L.back)}</button>
                </div>
            </section>`;

        app.querySelectorAll('[data-option]').forEach((btn) => btn.addEventListener('click', () => {
            state.answers[q.id] = btn.dataset.option;
            if (q.id === 'situation') pruneAnswers();
            track('cc-answer', { q: q.id, a: btn.dataset.option, n: i + 1, group: group() });
            next(i);
        }));

        const text = app.querySelector('#cc-text');
        if (text) {
            text.addEventListener('input', () => { state.texts[q.id] = text.value; save(); });
            const pass = (keep) => {
                state.texts[q.id] = keep ? text.value.trim() : '';
                track('cc-text', { q: q.id, filled: Boolean(state.texts[q.id]) });
                next(i);
            };
            app.querySelector('[data-cc-next]').addEventListener('click', () => pass(true));
            app.querySelector('[data-cc-skip]').addEventListener('click', () => pass(false));
        }

        app.querySelector('[data-cc-back]').addEventListener('click', back);
        return app.querySelector('#cc-q');
    }

    function next(i) {
        if (i + 1 < RESULT) {
            go(i + 1);
            return;
        }
        const r = CC.buildResult(content, state.answers);
        state.doneAt = new Date().toISOString();
        track('cc-complete', {
            group: r.group || 'none',
            result: r.key,
            second: r.secondKey || 'none',
            situation: state.answers.situation || 'none',
            when: state.answers.when || 'none',
        });
        go(RESULT);
    }

    function renderResult() {
        const r = CC.buildResult(content, state.answers);
        const situation = r.situation ? r.situation.id : 'none';
        const pkg = data.packages[r.packageSlug];

        let exercise = rich(r.exercise);
        Object.keys(r.exerciseLinks || {}).forEach((words) => {
            const url = data.links[r.exerciseLinks[words]];
            if (url) exercise = exercise.replace(esc(words), `<a href="${esc(url)}">${esc(words)}</a>`);
        });

        const also = r.alsoInTheMix ? `
                    <div class="cc-also">
                        <h3 class="cc-label">${esc(L.alsoInTheMix)}</h3>
                        <p>${rich(r.alsoInTheMix)}</p>
                    </div>` : '';

        const ow = content.ownWords;
        const written = [['outcome', ow.outcomeLabel], ['avoiding', ow.avoidingLabel]]
            .filter(([id]) => state.texts[id])
            .map(([id, label]) => `<dt>${esc(label)}</dt><dd>${esc(state.texts[id])}</dd>`).join('');
        const ownWords = written ? `
                    <div class="cc-block cc-own">
                        <h3 class="cc-label">${esc(ow.heading)}</h3>
                        <dl>${written}</dl>
                        <p class="cc-note">${esc(ow.note)}</p>
                    </div>` : '';

        const booking = withParams(data.booking, {
            utm_source: 'clarity-check',
            utm_medium: data.utmMedium,
            utm_content: r.key + '-' + situation,
        });
        const done = new Date(state.doneAt || Date.now());
        const date = done.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
        const pkgLink = `<a href="${esc(pkg.url)}" data-cc-package>${esc(pkg.name)}</a>`;
        const pageLink = r.situation
            ? ' ' + fill(content.situationLinkLine, 'pageLabel', `<a href="${esc(r.situation.page)}">${esc(r.situation.pageLabel)}</a>`)
            : '';

        app.innerHTML = `
            <section class="cc-screen cc-result" aria-labelledby="cc-headline">
                <div class="cc-inner">
                    <div class="cc-print-only cc-print-head" aria-hidden="true">
                        <p class="cc-print-title">The Clarity Check</p>
                        <p class="cc-print-meta">${esc(data.businessName)} &middot; ${esc(date)}</p>
                    </div>
                    <p class="section-label cc-eyebrow">${esc(L.resultEyebrow)}</p>
                    <div class="cc-read-block">
                        ${r.situation ? `<p class="cc-situation-line">${esc(r.situation.resultLine)}</p>` : ''}
                        <h2 class="cc-headline" id="cc-headline">${rich(r.headline)}</h2>
                        ${r.paragraphs.map((p) => `<p class="cc-read">${rich(p)}</p>`).join('')}
                    </div>
                    ${also}
                    <div class="cc-block">
                        <h3 class="cc-label">${esc(L.question)}</h3>
                        <p class="cc-big-question">${rich(r.question)}</p>
                    </div>
                    <div class="cc-exercise">
                        <h3 class="cc-label">${esc(L.exercise)}</h3>
                        <h4 class="cc-exercise-title">${rich(r.exerciseTitle)}</h4>
                        <p class="cc-exercise-text">${exercise}</p>
                    </div>
                    ${ownWords}
                    <p class="cc-print-only cc-print-close" aria-hidden="true">Bring this to a free conversation: mattrutherfordcoaching.com</p>
                    <div class="cc-invite">
                        <h3>${esc(content.invitation.heading)}</h3>
                        <p class="cc-invite-line">${esc(r.invitationLine)}</p>
                        <p>${esc(content.invitation.body)}</p>
                        <a href="${esc(booking)}" class="btn btn-primary" data-cc-book>${esc(content.invitation.button)}</a>
                    </div>
                    <p class="cc-quiet">${fill(content.packageLine, 'package', pkgLink)}${pageLink}</p>
                    <div class="cc-actions">
                        <button type="button" class="btn btn-outline" data-cc-save>${esc(L.save)}</button>
                        <a href="${esc(data.newsletter)}" class="text-link" data-cc-newsletter>${esc(L.newsletter)}<span aria-hidden="true"> &rarr;</span></a>
                    </div>
                    <button type="button" class="cc-back cc-restart" data-cc-restart>${esc(L.restart)}</button>
                </div>
            </section>`;

        app.querySelector('[data-cc-book]').addEventListener('click', () => track('cc-book', { result: r.key, situation }));
        app.querySelector('[data-cc-package]').addEventListener('click', () => track('cc-package', { package: r.packageSlug }));
        app.querySelector('[data-cc-newsletter]').addEventListener('click', () => track('cc-newsletter'));
        app.querySelector('[data-cc-save]').addEventListener('click', () => {
            track('cc-save');
            window.print();
        });
        app.querySelector('[data-cc-restart]').addEventListener('click', () => {
            track('cc-restart');
            state = fresh();
            go(LANDING);
        });
        return app.querySelector('#cc-headline');
    }

    // ─── Landing page: tiles and start buttons ───

    landing.querySelectorAll('[data-situation]').forEach((tile) => tile.addEventListener('click', () => {
        state.answers.situation = tile.dataset.situation;
        state.via = 'tile';
        pruneAnswers();
        track('cc-tile', { situation: tile.dataset.situation });
        track('cc-start', { via: 'tile', group: group() });
        go(1);
    }));

    landing.querySelectorAll('[data-cc-start]').forEach((btn) => btn.addEventListener('click', () => {
        state.via = 'button';
        track('cc-start', { via: 'button', group: group() });
        go(0);
    }));

    // A saved PDF takes its file name from the page title.
    let pageTitle = document.title;
    window.addEventListener('beforeprint', () => {
        if (state.step !== RESULT) return;
        pageTitle = document.title;
        document.title = 'Your Clarity Check result';
    });
    window.addEventListener('afterprint', () => { document.title = pageTitle; });

    history.replaceState({ cc: state.step, pos: 0 }, '');
    render(state.step !== LANDING);
})();
