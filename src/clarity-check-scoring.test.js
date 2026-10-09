/*
 * Tests for the Clarity Check scoring. Run with:  node clarity-check-scoring.test.js
 * No dependencies. Exits with code 1 if anything fails.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CC = require("./clarity-check-scoring.js");
// The content file sits beside this one in Matt's folder, and at content/clarity-check.json in the repository.
const contentPath = [path.join(__dirname, "clarity-check-content.json"), path.join(__dirname, "content", "clarity-check.json")].find((p) => fs.existsSync(p));
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));

let failed = 0;
function test(name, fn) {
    try { fn(); console.log("ok    " + name); }
    catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}

const scoredIds = content.questions.filter((q) => q.type === "choice" && q.id !== "situation" && q.id !== "when").map((q) => q.id);
const allowedFor = (situationId) => content.groups[content.situations.find((s) => s.id === situationId).group].results;

/* Every way a visitor with this situation can answer the scored questions. */
function everyAnswerSet(situationId, visit) {
    const answers = { situation: situationId };
    (function walk(i) {
        if (i === scoredIds.length) { visit(answers); return; }
        CC.questionFor(content, scoredIds[i], answers).options.forEach((o) => { answers[scoredIds[i]] = o.id; walk(i + 1); });
        delete answers[scoredIds[i]];
    })(0);
}

test("the content file is structurally sound", () => {
    assert.deepEqual(CC.validate(content), []);
});

test("there are twelve questions: ten choice, two written", () => {
    assert.equal(content.questions.length, 12);
    assert.equal(content.questions.filter((q) => q.type === "choice").length, 10);
    assert.equal(content.questions.filter((q) => q.type === "text").length, 2);
});

test("every situation belongs to a group", () => {
    const groups = Object.fromEntries(content.situations.map((s) => [s.id, s.group]));
    assert.deepEqual(groups, { manage: "arrived", newrole: "arrived", next: "deciding", change: "leading", leaving: "deciding" });
});

test("before a situation is chosen, nothing is ruled out", () => {
    const r = CC.buildResult(content, {});
    assert.equal(r.group, null);
    assert.equal(r.secondKey, null);
    assert.equal(r.invitationLine, content.invitation.defaultLine);
    const q = CC.questionFor(content, content.tieBreakQuestion, {});
    assert.equal(q.options.length, 6);
    q.options.forEach((o) => {
        assert.equal(CC.score(content, { [q.id]: o.id }).top, Object.keys(o.scores)[0]);
    });
});

test("someone already in a new role is never told they lack a direction or cannot choose", () => {
    ["manage", "newrole"].forEach((sid) => {
        everyAnswerSet(sid, (a) => {
            const s = CC.score(content, a);
            assert.ok(["transition", "confidence", "momentum", "sounding"].includes(s.top), sid + " reached " + s.top);
            assert.ok(s.second === null || ["transition", "confidence", "momentum", "sounding"].includes(s.second), sid + " was shown " + s.second + " as the runner-up");
        });
    });
});

test("someone still deciding is never told they have already made the move", () => {
    ["next", "leaving"].forEach((sid) => {
        everyAnswerSet(sid, (a) => {
            const s = CC.score(content, a);
            assert.notEqual(s.top, "transition");
            assert.notEqual(s.second, "transition");
        });
    });
});

test("each group can reach every one of its results, and none is rare or dominant", () => {
    content.situations.forEach((sit) => {
        const allowed = allowedFor(sit.id);
        const counts = Object.fromEntries(allowed.map((k) => [k, 0]));
        let total = 0;
        everyAnswerSet(sit.id, (a) => { counts[CC.score(content, a).top]++; total++; });
        allowed.forEach((k) => {
            const share = counts[k] / total;
            assert.ok(share > 0.1 && share < 0.4, sit.id + ": " + k + " is reached by " + (share * 100).toFixed(1) + "% of answer sets");
        });
        console.log("      " + sit.id + ": " + allowed.map((k) => k + " " + (counts[k] / total * 100).toFixed(0) + "%").join(", "));
    });
});

test("the answers that first showed the problem now give a fitting result", () => {
    // Just promoted, and every answer that used to point at Direction.
    const r = CC.buildResult(content, { situation: "newrole", clear: "cannot", time: "where", talked: "plenty", when: "now" });
    assert.notEqual(r.key, "direction");
    assert.equal(r.key, "transition");
});

test("questions are worded for the group", () => {
    const deciding = { situation: "next" }, arrived = { situation: "manage" }, leading = { situation: "change" };
    assert.match(CC.questionFor(content, "clear", deciding).prompt, /what you want next/);
    assert.match(CC.questionFor(content, "clear", arrived).prompt, /in this role/);
    assert.match(CC.questionFor(content, "clear", leading).prompt, /in this role/);
    assert.match(CC.questionFor(content, "feeling", deciding).prompt, /making the move/);
    assert.match(CC.questionFor(content, "feeling", arrived).prompt, /in this role/);
    assert.match(CC.questionFor(content, "applies", deciding).prompt, /most recent role/);
    assert.match(CC.questionFor(content, "applies", arrived).prompt, /still applies/);
});

test("the situation question carries the line shown under each tile", () => {
    const q = CC.questionFor(content, "situation", {});
    assert.equal(q.options.length, 5);
    q.options.forEach((o) => {
        const s = content.situations.find((x) => x.id === o.id);
        assert.equal(o.label, s.label);
        assert.equal(o.blurb, s.tileBlurb);
        assert.ok(o.blurb.length > 10);
    });
});

test("question 9 only offers what a group can act on", () => {
    const ids = (sid) => CC.questionFor(content, "harder", { situation: sid }).options.map((o) => o.id);
    assert.deepEqual(ids("manage"), ["confidence", "transition", "momentum", "sounding"]);
    assert.deepEqual(ids("next"), ["direction", "decision", "confidence", "momentum", "sounding"]);
    assert.deepEqual(ids("change"), ["decision", "confidence", "momentum", "sounding"]);
});

test("an answer left over from another group's wording is ignored, not misread", () => {
    // "little" only exists in the deciding wording of question 8.
    const s = CC.score(content, { situation: "manage", applies: "little", harder: "momentum" });
    assert.equal(s.top, "momentum");
    assert.equal(s.totals.direction, 0);
});

test("the Confidence result is worded for someone who already has the role", () => {
    const inRole = CC.buildResult(content, { situation: "newrole", harder: "confidence" });
    const deciding = CC.buildResult(content, { situation: "next", harder: "confidence" });
    assert.equal(inRole.key, "confidence");
    assert.match(inRole.headline, /^You have the role/);
    assert.match(deciding.headline, /^You know the move/);
    assert.equal(inRole.question, deciding.question);
    assert.equal(inRole.exercise, deciding.exercise);
});

test("a tie goes to the result named by the tie-break question", () => {
    // Decision gets 3 from two other questions; Momentum gets 3 from question 9 alone.
    const s = CC.score(content, { situation: "next", clear: "options", howlong: "months", harder: "momentum" });
    assert.equal(s.totals.decision, 3);
    assert.equal(s.totals.momentum, 3);
    assert.equal(s.top, "momentum");
    assert.equal(s.second, "decision");
});

test("a runner-up below the threshold is not reported", () => {
    const s = CC.score(content, { situation: "next", harder: "direction", feeling: "doubt" });
    assert.equal(s.top, "direction");
    assert.equal(s.totals.confidence, 2);
    assert.equal(s.second, null);
});

test("the situation sets the line and the link on the result", () => {
    const r = CC.buildResult(content, { situation: "manage", harder: "transition" });
    assert.equal(r.key, "transition");
    assert.equal(r.situation.page, "/new-manager/");
    assert.match(r.situation.resultLine, /^You said/);
});

test("each result points at the right package", () => {
    const pkg = (answers) => CC.buildResult(content, answers).packageSlug;
    assert.equal(pkg({ situation: "change", harder: "sounding" }), "leadership-engagement");
    assert.equal(pkg({ situation: "change", harder: "confidence" }), "leadership-engagement");
    assert.equal(pkg({ situation: "change", harder: "decision" }), "clarity-session");
    assert.equal(pkg({ situation: "newrole", harder: "transition" }), "the-next-move");
    assert.equal(pkg({ situation: "next", harder: "direction" }), "the-next-move");
    assert.equal(pkg({ situation: "leaving", harder: "momentum" }), "ongoing-partnership");
});

test("the timing answer chooses the first line of the invitation and nothing else", () => {
    const base = { situation: "next", harder: "decision" };
    CC.questionFor(content, "when", base).options.forEach((o) => {
        const r = CC.buildResult(content, Object.assign({ when: o.id }, base));
        assert.equal(r.invitationLine, o.invitationLine);
        assert.equal(r.key, "decision");
    });
});

test("house style: no em-dashes, en-dashes or ampersands in the wording", () => {
    const strings = [];
    (function collect(v) {
        if (typeof v === "string") strings.push(v);
        else if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === "object") Object.values(v).forEach(collect);
    })(content);
    strings.forEach((s) => {
        assert.ok(!/[\u2014\u2013]/.test(s), "dash in: " + s);
        assert.ok(!/\s&\s/.test(s), "ampersand in: " + s);
    });
});

if (failed) { console.log("\n" + failed + " failed"); process.exit(1); }
console.log("\nAll passed.");
