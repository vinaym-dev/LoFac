// scripts/supercommit/parse.test.js
// Node 20+, ESM using node:test
import test from "node:test";
import assert from "node:assert/strict";
import { parseCommitMessage } from "./parse.js";

test("all tokens present, any order", () => {
    const msg = "PAY-101 COMMENT:Refactor LOG:2.5h@2025-10-01 STATUS:In Progress PHASE:Development";
    const r = parseCommitMessage(msg);
    assert.equal(r.issue, "PAY-101");
    assert.equal(r.status, "In Progress");
    assert.equal(r.logHours, 2.5);
    assert.equal(r.logDate, "2025-10-01");
    assert.equal(r.comment, "Refactor");
    assert.equal(r.phase, "Development"); // ✅ New field check
});

test("issue only", () => {
    const r = parseCommitMessage("ABC-7");
    assert.equal(r.issue, "ABC-7");
    assert.equal(r.status, null);
    assert.equal(r.logHours, null);
    assert.equal(r.logDate, null);
    assert.equal(r.comment, null);
    assert.equal(r.phase, null); // ✅ New field check
});

test("LOG only", () => {
    const r = parseCommitMessage("OPS-55 LOG:1h@2025-12-31");
    assert.equal(r.issue, "OPS-55");
    assert.equal(r.logHours, 1);
    assert.equal(r.logDate, "2025-12-31");
    assert.equal(r.status, null);
    assert.equal(r.comment, null);
    assert.equal(r.phase, null); // ✅ New field check
});

test("invalid issue key", () => {
    assert.throws(
        () => parseCommitMessage("OPS55 LOG:1h@2025-12-31"),
        /Super Commit format/i
    );
});

test("invalid hours (non-positive)", () => {
    // Use 0h so regex still matches, then parser enforces positive
    assert.throws(
        () => parseCommitMessage("ABC-1 LOG:0h@2025-01-01"),
        /positive number/i
    );
});

test("invalid date format", () => {
    // Slashes don't match the regex, so expect the generic format error
    assert.throws(
        () => parseCommitMessage("ABC-1 LOG:1h@2025/01/01"),
        /Super Commit format/i
    );
});

test("invalid calendar date", () => {
    assert.throws(
        () => parseCommitMessage("ABC-1 LOG:1h@2025-02-30"),
        /valid calendar date/i
    );
});

test("multiple LOG tokens -> error", () => {
    assert.throws(
        () => parseCommitMessage("ABC-1 LOG:1h@2025-10-01 LOG:2h@2025-10-02"),
        /Only one LOG token/i
    );
});

test("multiple STATUS tokens -> error", () => {
    assert.throws(
        () => parseCommitMessage("ABC-1 STATUS:In Progress STATUS:Done"),
        /Only one STATUS token/i
    );
});

test("multiple COMMENT tokens -> error", () => {
    assert.throws(
        () => parseCommitMessage("ABC-1 COMMENT:one COMMENT:two"),
        /Only one COMMENT token/i
    );
});

// ✅ NEW TEST — Multiple PHASE tokens should throw an error
test("multiple PHASE tokens -> error", () => {
    assert.throws(
        () => parseCommitMessage("ABC-1 PHASE:Design PHASE:Development"),
        /Only one PHASE token/i
    );
});

//
// ---- Additional hardening tests (backward-compatible) ---------------------
//

// READY normalization variants
test("READY true variants", () => {
    const r1 = parseCommitMessage("ABC-1 READY:Yes");
    const r2 = parseCommitMessage("ABC-1 READY:true");
    const r3 = parseCommitMessage("ABC-1 READY:1");
    const r4 = parseCommitMessage("ABC-1 READY:Y");
    assert.equal(r1.ready, true);
    assert.equal(r2.ready, true);
    assert.equal(r3.ready, true);
    assert.equal(r4.ready, true);
});

test("READY false variants", () => {
    const r1 = parseCommitMessage("ABC-1 READY:No");
    const r2 = parseCommitMessage("ABC-1 READY:false");
    const r3 = parseCommitMessage("ABC-1 READY:0");
    const r4 = parseCommitMessage("ABC-1 READY:N");
    assert.equal(r1.ready, false);
    assert.equal(r2.ready, false);
    assert.equal(r3.ready, false);
    assert.equal(r4.ready, false);
});

// LOG formats: minutes and h:mm
test("LOG minutes format", () => {
    const r = parseCommitMessage("ABC-1 LOG:90m@2025-10-10");
    assert.equal(r.logHours, 1.5);
    assert.equal(r.logDate, "2025-10-10");
});

test("LOG h:mm format", () => {
    const r = parseCommitMessage("ABC-1 LOG:1:45@2025-10-11");
    assert.equal(r.logHours, 1.75);
    assert.equal(r.logDate, "2025-10-11");
});

// DATE without LOG should be accepted and reflected as logDate with null hours
test("DATE without LOG", () => {
    const r = parseCommitMessage("ABC-1 DATE:2025-10-12");
    assert.equal(r.logHours, null);
    assert.equal(r.logDate, "2025-10-12");
});

// CAT alias maps to phase when PHASE missing
test("CAT alias populates phase when PHASE absent", () => {
    const r = parseCommitMessage("ABC-1 CAT:QA");
    assert.equal(r.phase, "QA");
});

// Token boundary: COMMENT with HTTP: should not be misparsed as a token boundary
test("COMMENT containing 'HTTP:' does not break token parsing", () => {
    const r = parseCommitMessage("ABC-1 COMMENT:Fix HTTP:500 retry handler LOG:1h@2025-10-13");
    assert.equal(r.comment, "Fix HTTP:500 retry handler");
    assert.equal(r.logHours, 1);
    assert.equal(r.logDate, "2025-10-13");
});