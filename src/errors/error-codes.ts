// Local CLI error codes — C{STATUS}-{DOMAIN}-{SEQ}.
// Backend codes (R*/G*) are propagated as-is from the response envelope; never remap them here.
export const ErrorCodes = {
  Auth: {
    notLoggedIn: 'C401-AUT-001',
  },
  Config: {
    notFound: 'C000-CFG-001',
    corrupted: 'C000-CFG-002',
  },
  Network: {
    requestFailed: 'C000-NET-001',
    parseFailed: 'C000-NET-003',
  },
  Project: {
    notFound: 'C404-PRJ-001',
  },
  Role: {
    notFound: 'C404-ROL-001',
  },
  Group: {
    notFound: 'C404-GRP-001',
  },
  Team: {
    notFound: 'C404-TEM-001',
  },
  // Monitoring groups requested by a bulk operation and missing from the response. The server
  // filters the selection by project and answers 200 on what is left (`scope.where(id:)`), so an
  // id from another project — or from stale data — disappears without a word: whoever asked to
  // close thirty groups would see twenty-eight closed and nobody would tell them (CYCL-44).
  ErrorGroup: {
    notFound: 'C404-ERG-001',
  },
  MetricGroup: {
    notFound: 'C404-MTG-001',
  },
  Member: {
    notFound: 'C404-MBR-001',
  },
  // A service account's environment boundary, requested and not applied (CYCL-46). The server
  // intersects the received codes with the organization's and answers 200 on what is left: a
  // typo does not narrow anything, it ERASES the boundary — and an empty allow-list means "every
  // environment", the opposite of what was requested, without a word. The command checks the
  // codes before writing, but reading environments needs a permission that may be missing:
  // comparing requested vs applied stays as the safety net, and it works both ways (a code that
  // disappeared, or one that showed up that nobody asked for).
  ServiceAccount: {
    boundaryMismatch: 'C404-SVA-001',
    restrictionNotApplied: 'C500-SVA-002',
  },
  // A ticket given to link it elsewhere (a workload activity) and not found: the reference is
  // neither an id nor a readable code ("DRFL-3"), or that code does not exist among the visible
  // tickets. Given an id it cannot see, the server would save "no ticket" without saying
  // anything (CYCL-42).
  Ticket: {
    notFound: 'C404-TKT-001',
  },
  // The backend answers 404 without an application code on the atomic publish route: it is not
  // the project that is missing, it is the server that is older than the command (CYCL-8).
  Knowledge: {
    publishUnavailable: 'C404-KNW-001',
  },
  // A ticket's status and priority, given by code or label and not found in the organization's
  // lookups (or matching more than one entry) — CYCL-34.
  TicketStatus: {
    notFound: 'C404-STA-001',
  },
  TicketPriority: {
    notFound: 'C404-PRI-001',
  },
  Device: {
    expired: 'C408-DEV-001',
    failed: 'C400-DEV-002',
  },
  // Waiting for an answer prepared elsewhere (the assistant, "ask the tickets"). `timeout` is not a
  // server failure: the question was sent and the answer is still on its way, it is the command that
  // stopped waiting — the message says where to find it later. `failed` covers the case where the
  // server declares the answer failed without attaching its own code (CYCL-43).
  Ask: {
    timeout: 'C408-ASK-001',
    failed: 'C502-ASK-002',
  },
  // The command line itself was rejected (missing/unknown flag or arg, value outside the allowed
  // options, a `this.error(...)` guard): the message says what to fix, and it never reached the
  // server — the opposite of System.unexpected, which stays for real failures (CYCL-33).
  Input: {
    invalid: 'C400-INP-001',
  },
  System: {
    unexpected: 'C500-SYS-001',
  },
} as const
