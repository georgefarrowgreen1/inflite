// Mail's body shell's script (One roof stage 4, s4/spec §3.3; security-critical, deep review R3): reads m, t, img, p from
// location.hash (strict patterns; p must be one of <html data-parents>), posts only to parent with targetOrigin = p,
// accepts only messages with e.source === parent && e.origin === p, fetches /api/messages/<m> (same origin), and draws
// the message in the inner script-less sandbox (app.js's htmlFrame and messageBody, moved). B0-b's empty shell; MB
// writes it. A classic script: no imports, no exports.
