# Road Ahead's private inputs land here, and never leave

This directory is gitignored except for this file. **The repository is
public and these figures are not**: salary, savings, the mortgage in
principle, the owner's plans and every figure the Rectory kit published.

    node tools/road-ahead-kit.mjs <kit zip>     build kit-extract.json from the kit
    node tools/road-ahead-checksums.mjs         prove the engine reproduces the kit
    node tools/road-ahead.mjs roads             the roads under a scenario
    node tools/road-ahead.mjs assess <file>     one listing, the kit's method
    node tools/road-ahead.mjs sweep             the Golden Egg's dearest sustainable bid

`kit-extract.json` is the kit's own inputs and published results, taken
from the objects its Python ran on (see `tools/road-ahead-kit.py`), with
every variable labelled twice: the kit's evidence label and the portal's
confidence (STATED is confirmed, VERIFIED researched, ESTIMATE and CHECK
drafted, per the owner's answer of 30 Sep 2026). Once the Road Ahead
tables exist the database holds the same inputs, and an export from it
lands here too.

Two gates depend on this directory, and neither may be removed:

- `npm run test:secrets` fails if anything here but this file is ever
  tracked by git, and - wherever an extract is present - if any tracked
  file carries the owner's surname, home village, salary or mortgage in
  principle. The values are read from the extract at check time; no
  list of them is kept, hashed or otherwise, because a hash of a salary
  can be reversed in a second by trying every number.
- `npm run test:checksums` runs the engine on these inputs and requires
  every published figure, exactly. Without an extract it skips and says
  so, as it does in CI.
