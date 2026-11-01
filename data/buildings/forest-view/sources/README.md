# Source drawings

Gitignored. The repository is public; the agent's particulars (Mitchells,
ref NWM260479: floor plan, photographs, aerials) are someone else's
copyright, so they are never committed. The originals are in PRIVATE
storage - Supabase bucket `house-private`, folder `forest-view/`,
readable by signed-in household members only (decision RA-06) - and are
registered in `source_documents`.

Drop them in here locally if you want to compare a drawing with the model
by eye. Nothing breaks without them: every figure the model was measured
from is recorded in `../building.json` under `statedDimensions`, with the
document it came from, and the Survey view reports each one against what
the geometry computes whether or not the drawing itself is present.
