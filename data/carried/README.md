# Carried-over blobs land here, and never leave

This directory is gitignored. **The repository is public and these
figures are not.**

A blob in here is a read-only extract from another Supabase project,
crossing between two accounts that cannot be connected at the same time.
It is an archive, not a ledger: every row it carries lands unreviewed and
drives no total, projection or allocation until a person confirms it.

    node tools/carry.mjs plan                     what to run on the source
    node tools/carry.mjs seal   <file>            write its checksum
    node tools/carry.mjs check  <file>            validate before loading
    node tools/carry.mjs load   <file> <uuid>     print the load SQL

`npm test` fails if a blob is ever tracked by git. That gate is the only
thing standing between this directory and a public commit, so do not
remove it.
