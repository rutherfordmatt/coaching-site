/*
 * The Clarity Check: scoring.
 *
 * Pure functions with no DOM access, so the same file runs in the browser
 * (as window.ClarityCheck) and under Node for the tests.
 *
 *   answers = { situation: "next", howlong: "months", ..., harder: "decision", when: "soon" }
 *
 * Keys are question ids and values are option ids from the content file.
 * Unanswered questions are simply absent. Written answers are never passed in.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.ClarityCheck = factory();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    /* Every place an answer can add points: the situation tile and each choice question. */
    function scoredOptions(content, answers) {
        var picked = [];
        content.questions.forEach(function (q) {
            if (q.type !== "choice") return;
            var chosen = answers[q.id];
            if (chosen == null) return;
            var source = q.id === "situation" ? content.situations : q.options;
            var option = byId(source, chosen);
            if (option) picked.push({ question: q.id, option: option });
        });
        return picked;
    }

    /*
     * Add up the points. Highest total wins. A tie goes to the result named by the
     * tie-break question (question 9), then to the order in content.resultOrder.
     * The runner-up is reported only when it reaches content.secondThreshold.
     */
    function score(content, answers) {
        var order = content.resultOrder;
        var totals = {};
        order.forEach(function (k) { totals[k] = 0; });

        var tiebreak = null;
        scoredOptions(content, answers).forEach(function (p) {
            var s = p.option.scores || {};
            Object.keys(s).forEach(function (k) { totals[k] += s[k]; });
            if (p.question === content.tieBreakQuestion) tiebreak = Object.keys(s)[0] || null;
        });

        var ranked = order.slice().sort(function (a, b) {
            if (totals[b] !== totals[a]) return totals[b] - totals[a];
            if (a === tiebreak) return -1;
            if (b === tiebreak) return 1;
            return order.indexOf(a) - order.indexOf(b);
        });

        return {
            top: ranked[0],
            second: totals[ranked[1]] >= content.secondThreshold ? ranked[1] : null,
            totals: totals
        };
    }

    /* Everything the result page needs, as plain strings and ids. */
    function buildResult(content, answers) {
        var s = score(content, answers);
        var result = content.results[s.top];
        var situation = byId(content.situations, answers.situation) || null;

        var pkg = result.package;
        if (situation && result.packageBySituation && result.packageBySituation[situation.id]) {
            pkg = result.packageBySituation[situation.id];
        }

        var timing = byId(byId(content.questions, "when").options, answers.when);

        return {
            key: s.top,
            secondKey: s.second,
            totals: s.totals,
            situation: situation,
            headline: result.headline,
            paragraphs: result.paragraphs,
            question: result.question,
            exerciseTitle: result.exerciseTitle,
            exercise: result.exercise,
            alsoInTheMix: s.second ? content.results[s.second].alsoInTheMix : null,
            packageSlug: pkg,
            invitationLine: timing ? timing.invitationLine : content.invitation.defaultLine
        };
    }

    /* Structural checks on the content file. Returns a list of problems; empty means fine. */
    function validate(content) {
        var problems = [];
        var keys = content.resultOrder || [];
        var need = ["headline", "paragraphs", "question", "exerciseTitle", "exercise", "alsoInTheMix", "package"];

        keys.forEach(function (k) {
            var r = (content.results || {})[k];
            if (!r) { problems.push("results." + k + " is missing"); return; }
            need.forEach(function (f) {
                var v = r[f];
                if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) problems.push("results." + k + "." + f + " is empty");
            });
            if (content.packages.indexOf(r.package) === -1) problems.push("results." + k + ".package is not a known package slug");
            Object.keys(r.exerciseLinks || {}).forEach(function (words) {
                if (String(r.exercise).indexOf(words) === -1) problems.push("results." + k + ".exerciseLinks names words that are not in the exercise: " + words);
            });
            [r.headline, r.question, r.exerciseTitle, r.exercise, r.alsoInTheMix].concat(r.paragraphs || []).forEach(function (text) {
                if ((String(text).split("**").length - 1) % 2 !== 0) problems.push("results." + k + " has an unclosed ** in: " + text);
            });
            Object.keys(r.packageBySituation || {}).forEach(function (sid) {
                if (!byId(content.situations, sid)) problems.push("results." + k + ".packageBySituation names unknown situation " + sid);
                if (content.packages.indexOf(r.packageBySituation[sid]) === -1) problems.push("results." + k + ".packageBySituation." + sid + " is not a known package slug");
            });
        });

        function checkScores(where, scores) {
            Object.keys(scores || {}).forEach(function (k) {
                if (keys.indexOf(k) === -1) problems.push(where + " scores unknown result " + k);
                if (typeof scores[k] !== "number") problems.push(where + " score for " + k + " is not a number");
            });
        }

        var ids = {};
        (content.situations || []).forEach(function (s) { checkScores("situation " + s.id, s.scores); });
        (content.questions || []).forEach(function (q) {
            if (ids[q.id]) problems.push("duplicate question id " + q.id);
            ids[q.id] = true;
            if (q.type !== "choice" || q.id === "situation") return;
            var seen = {};
            (q.options || []).forEach(function (o) {
                if (seen[o.id]) problems.push("question " + q.id + " has duplicate option id " + o.id);
                seen[o.id] = true;
                checkScores("question " + q.id + " option " + o.id, o.scores);
            });
        });

        if (!byId(content.questions || [], content.tieBreakQuestion)) problems.push("tieBreakQuestion does not name a question");
        return problems;
    }

    return { score: score, buildResult: buildResult, validate: validate };
});
