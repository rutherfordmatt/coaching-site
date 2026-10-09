/*
 * Tests for the Clarity Check scoring. Run with:  node clarity-check-scoring.test.js
 * No dependencies. Exits with code 1 if anything fails.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CC = require("./clarity-check-scoring.js");
const content = JSON.parse(fs.readFileSync(path.join(__dirname, "content", "clarity-check.json"), "utf8"));

let failed = 0;
function test(name, fn) {
    try { fn(); console.log("ok    " + name); }
    catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}

const choiceQuestions = content.questions.filter((q) => q.type === "choice");
const optionsOf = (q) => (q.id === "situation" ? content.situations : q.options);

test("the content file is structurally sound", () => {
    assert.deepEqual(CC.validate(content), []);
});

test("there are twelve questions: ten choice, two written", () => {
    assert.equal(content.questions.length, 12);
    assert.equal(choiceQuestions.length, 10);
    assert.equal(content.questions.filter((q) => q.type === "text").length, 2);
});

test("no answers at all still gives a result and no runner-up", () => {
    const r = CC.buildResult(content, {});
    assert.equal(r.key, content.resultOrder[0]);
    assert.equal(r.secondKey, null);
    assert.equal(r.situation, null);
    assert.equal(r.invitationLine, content.invitation.defaultLine);
});

test("each answer to the tie-break question, on its own, gives its own result", () => {
    const q = content.questions.find((x) => x.id === content.tieBreakQuestion);
    q.options.forEach((o) => {
        const expected = Object.keys(o.scores)[0];
        assert.equal(CC.score(content, { [q.id]: o.id }).top, expected);
    });
});

test("a tie goes to the result named by the tie-break question", () => {
    // Decision gets 3 from two other questions; Momentum gets 3 from question 9 alone.
    const answers = { clear: "options", howlong: "months", harder: "momentum" };
    const s = CC.score(content, answers);
    assert.equal(s.totals.decision, 3);
    assert.equal(s.totals.momentum, 3);
    assert.equal(s.top, "momentum");
    assert.equal(s.second, "decision");
});

test("a runner-up below the threshold is not reported", () => {
    const s = CC.score(content, { harder: "direction", feeling: "doubt" });
    assert.equal(s.top, "direction");
    assert.equal(s.totals.confidence, 2);
    assert.equal(s.second, null);
});

test("the situation tile sets the line, the link and a small nudge", () => {
    const r = CC.buildResult(content, { situation: "manage" });
    assert.equal(r.key, "transition");
    assert.equal(r.situation.page, "/new-manager/");
});

test("leading through change points three results at the longer engagement", () => {
    ["transition", "sounding", "confidence"].forEach((k) => {
        assert.equal(CC.buildResult(content, { situation: "change", harder: k }).packageSlug, "leadership-engagement");
    });
    assert.equal(CC.buildResult(content, { situation: "change", harder: "decision" }).packageSlug, "clarity-session");
    assert.equal(CC.buildResult(content, { situation: "next", harder: "transition" }).packageSlug, "the-next-move");
});

test("the timing answer chooses the first line of the invitation and nothing else", () => {
    const base = { situation: "next", harder: "decision" };
    const q = content.questions.find((x) => x.id === "when");
    q.options.forEach((o) => {
        const r = CC.buildResult(content, Object.assign({ when: o.id }, base));
        assert.equal(r.invitationLine, o.invitationLine);
        assert.equal(r.key, "decision");
    });
});

test("every possible set of answers gives a valid result, and all six can be reached", () => {
    // The timing question does not score, so it is left out: 5 x 4^7 x 6 = 491,520 combinations.
    const scored = choiceQuestions.filter((q) => q.id !== "when");
    const counts = Object.fromEntries(content.resultOrder.map((k) => [k, 0]));
    const answers = {};
    let total = 0;
    (function walk(i) {
        if (i === scored.length) {
            const s = CC.score(content, answers);
            assert.ok(s.top in counts);
            assert.ok(s.second === null || (s.second in counts && s.second !== s.top));
            counts[s.top]++;
            total++;
            return;
        }
        optionsOf(scored[i]).forEach((o) => { answers[scored[i].id] = o.id; walk(i + 1); });
    })(0);
    assert.equal(total, 491520);
    content.resultOrder.forEach((k) => {
        const share = counts[k] / total;
        assert.ok(share > 0.08 && share < 0.3, k + " is reached by " + (share * 100).toFixed(1) + "% of answer sets");
    });
    console.log("      share of all answer sets: " + content.resultOrder.map((k) => k + " " + (counts[k] / total * 100).toFixed(1) + "%").join(", "));
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
