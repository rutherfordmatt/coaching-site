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
 *
 * Groups. Each situation tile belongs to a group (arrived, deciding, leading).
 * The group decides three things:
 *   1. which results are possible, so someone already in a new role is never
 *      told they are still looking for a direction;
 *   2. which wording of a question they see, and which options;
 *   3. which wording of a result they see.
 * The page should never read questions or results straight from the content
 * file. Use questionFor() and buildResult(), which apply the group for you.
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

    function forGroup(variants, group) {
        if (!variants || !group) return null;
        for (var i = 0; i < variants.length; i++) if (variants[i].groups.indexOf(group) !== -1) return variants[i];
        return null;
    }

    /* The group of the chosen situation, or null before one is chosen. */
    function groupOf(content, answers) {
        var s = byId(content.situations, answers.situation);
        return s ? s.group : null;
    }

    /* The results this visitor can get. Everything, until a situation is chosen. */
    function eligible(content, group) {
        return group && content.groups[group] ? content.groups[group].results : content.resultOrder;
    }

    /*
     * A question as this visitor should see it: the right prompt, and only the
     * options meant for their group, each with the scores that apply to them.
     * Returns { id, part, type, optional, prompt, helper, options }.
     * Options of the situation question also carry a blurb, the line under each tile.
     */
    function questionFor(content, questionId, answers) {
        var q = byId(content.questions, questionId);
        if (!q) return null;
        var group = groupOf(content, answers || {});
        var v = forGroup(q.variants, group) || {};
        var out = {
            id: q.id, part: q.part, type: q.type, optional: !!q.optional,
            prompt: v.prompt || q.prompt,
            helper: v.helper != null ? v.helper : (q.helper || ""),
            options: null
        };
        if (q.type !== "choice") return out;

        if (q.id === "situation") {
            out.options = content.situations.map(function (s) {
                return { id: s.id, label: s.label, blurb: s.tileBlurb || "", scores: s.scores || {} };
            });
            return out;
        }

        out.options = (v.options || q.options).filter(function (o) {
            return !o.groups || !group || o.groups.indexOf(group) !== -1;
        }).map(function (o) {
            var scores = (group && o.scoresByGroup && o.scoresByGroup[group]) || o.scores || {};
            var item = { id: o.id, label: o.label, scores: scores };
            if (o.invitationLine) item.invitationLine = o.invitationLine;
            return item;
        });
        return out;
    }

    /*
     * Add up the points. Only results possible for the visitor's group count.
     * Highest total wins. A tie goes to the result named by the tie-break
     * question (question 9), then to the order in content.resultOrder.
     * The runner-up is reported only when it reaches content.secondThreshold.
     */
    function score(content, answers) {
        var group = groupOf(content, answers);
        var allowed = eligible(content, group);
        var totals = {};
        content.resultOrder.forEach(function (k) { totals[k] = 0; });

        var tiebreak = null;
        content.questions.forEach(function (q) {
            if (q.type !== "choice") return;
            var chosen = answers[q.id];
            if (chosen == null) return;
            var option = byId(questionFor(content, q.id, answers).options, chosen);
            if (!option) return; // an answer left over from another group's wording
            Object.keys(option.scores).forEach(function (k) {
                if (allowed.indexOf(k) !== -1) totals[k] += option.scores[k];
            });
            if (q.id === content.tieBreakQuestion) {
                var first = Object.keys(option.scores)[0];
                if (allowed.indexOf(first) !== -1) tiebreak = first;
            }
        });

        var order = content.resultOrder;
        var ranked = allowed.slice().sort(function (a, b) {
            if (totals[b] !== totals[a]) return totals[b] - totals[a];
            if (a === tiebreak) return -1;
            if (b === tiebreak) return 1;
            return order.indexOf(a) - order.indexOf(b);
        });

        return {
            group: group,
            top: ranked[0],
            second: totals[ranked[1]] >= content.secondThreshold ? ranked[1] : null,
            totals: totals
        };
    }

    /* A result's wording for a group: the base text with any group version laid over it. */
    function resultFor(content, key, group) {
        var base = content.results[key];
        var v = forGroup(base.variants, group) || {};
        var out = {};
        ["name", "headline", "paragraphs", "question", "exerciseTitle", "exercise", "exerciseLinks", "alsoInTheMix", "package", "packageBySituation"].forEach(function (f) {
            out[f] = v[f] != null ? v[f] : base[f];
        });
        return out;
    }

    /* Everything the result page needs, as plain strings and ids. */
    function buildResult(content, answers) {
        var s = score(content, answers);
        var result = resultFor(content, s.top, s.group);
        var situation = byId(content.situations, answers.situation) || null;

        var pkg = result.package;
        if (situation && result.packageBySituation && result.packageBySituation[situation.id]) {
            pkg = result.packageBySituation[situation.id];
        }

        var timing = byId(byId(content.questions, "when").options, answers.when);

        return {
            key: s.top,
            secondKey: s.second,
            group: s.group,
            totals: s.totals,
            situation: situation,
            headline: result.headline,
            paragraphs: result.paragraphs,
            question: result.question,
            exerciseTitle: result.exerciseTitle,
            exercise: result.exercise,
            exerciseLinks: result.exerciseLinks || null,
            alsoInTheMix: s.second ? resultFor(content, s.second, s.group).alsoInTheMix : null,
            packageSlug: pkg,
            invitationLine: timing ? timing.invitationLine : content.invitation.defaultLine
        };
    }

    /* Structural checks on the content file. Returns a list of problems; empty means fine. */
    function validate(content) {
        var problems = [];
        var keys = content.resultOrder || [];
        var groups = Object.keys(content.groups || {});
        var need = ["headline", "paragraphs", "question", "exerciseTitle", "exercise", "alsoInTheMix", "package"];

        function checkGroups(where, list) {
            (list || []).forEach(function (g) { if (groups.indexOf(g) === -1) problems.push(where + " names unknown group " + g); });
        }
        function checkScores(where, scores) {
            Object.keys(scores || {}).forEach(function (k) {
                if (keys.indexOf(k) === -1) problems.push(where + " scores unknown result " + k);
                if (typeof scores[k] !== "number") problems.push(where + " score for " + k + " is not a number");
            });
        }
        function checkText(where, texts) {
            texts.forEach(function (text) {
                if (text != null && (String(text).split("**").length - 1) % 2 !== 0) problems.push(where + " has an unclosed ** in: " + text);
            });
        }
        function checkOptions(where, options) {
            var seen = {};
            (options || []).forEach(function (o) {
                if (seen[o.id]) problems.push(where + " has duplicate option id " + o.id);
                seen[o.id] = true;
                checkScores(where + " option " + o.id, o.scores);
                checkGroups(where + " option " + o.id, o.groups);
                Object.keys(o.scoresByGroup || {}).forEach(function (g) {
                    checkGroups(where + " option " + o.id + " scoresByGroup", [g]);
                    checkScores(where + " option " + o.id + " for " + g, o.scoresByGroup[g]);
                });
            });
        }

        groups.forEach(function (g) {
            var list = content.groups[g].results || [];
            if (list.length < 2) problems.push("group " + g + " needs at least two possible results");
            list.forEach(function (k) { if (keys.indexOf(k) === -1) problems.push("group " + g + " lists unknown result " + k); });
        });

        keys.forEach(function (k) {
            var r = (content.results || {})[k];
            if (!r) { problems.push("results." + k + " is missing"); return; }
            need.forEach(function (f) {
                var v = r[f];
                if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) problems.push("results." + k + "." + f + " is empty");
            });
            if (content.packages.indexOf(r.package) === -1) problems.push("results." + k + ".package is not a known package slug");
            Object.keys(r.packageBySituation || {}).forEach(function (sid) {
                if (!byId(content.situations, sid)) problems.push("results." + k + ".packageBySituation names unknown situation " + sid);
                if (content.packages.indexOf(r.packageBySituation[sid]) === -1) problems.push("results." + k + ".packageBySituation." + sid + " is not a known package slug");
            });
            Object.keys(r.exerciseLinks || {}).forEach(function (words) {
                if (String(r.exercise).indexOf(words) === -1) problems.push("results." + k + ".exerciseLinks names words that are not in the exercise: " + words);
            });
            checkText("results." + k, [r.headline, r.question, r.exerciseTitle, r.exercise, r.alsoInTheMix].concat(r.paragraphs || []));
            (r.variants || []).forEach(function (v, i) {
                checkGroups("results." + k + ".variants[" + i + "]", v.groups);
                checkText("results." + k + ".variants[" + i + "]", [v.headline, v.question, v.exerciseTitle, v.exercise, v.alsoInTheMix].concat(v.paragraphs || []));
            });
        });

        var ids = {};
        (content.situations || []).forEach(function (s) {
            checkScores("situation " + s.id, s.scores);
            if (groups.indexOf(s.group) === -1) problems.push("situation " + s.id + " has no valid group");
        });
        (content.questions || []).forEach(function (q) {
            if (ids[q.id]) problems.push("duplicate question id " + q.id);
            ids[q.id] = true;
            if (q.type !== "choice" || q.id === "situation") return;
            checkOptions("question " + q.id, q.options);
            (q.variants || []).forEach(function (v, i) {
                checkGroups("question " + q.id + ".variants[" + i + "]", v.groups);
                if (v.options) checkOptions("question " + q.id + ".variants[" + i + "]", v.options);
            });
        });

        if (!byId(content.questions || [], content.tieBreakQuestion)) problems.push("tieBreakQuestion does not name a question");

        // Every group must be able to reach each of its results through the tie-break question,
        // and must never be offered a tie-break option that points at a result it cannot get.
        groups.forEach(function (g) {
            var sit = (content.situations || []).filter(function (s) { return s.group === g; })[0];
            if (!sit) { problems.push("group " + g + " has no situation"); return; }
            var q = questionFor(content, content.tieBreakQuestion, { situation: sit.id });
            var offered = q.options.map(function (o) { return Object.keys(o.scores)[0]; });
            content.groups[g].results.forEach(function (k) {
                if (offered.indexOf(k) === -1) problems.push("group " + g + " has no tie-break option for " + k);
            });
            offered.forEach(function (k) {
                if (content.groups[g].results.indexOf(k) === -1) problems.push("group " + g + " is offered a tie-break option for " + k + ", which it cannot get");
            });
        });

        return problems;
    }

    return { score: score, buildResult: buildResult, questionFor: questionFor, groupOf: groupOf, validate: validate };
});
