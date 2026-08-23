# Pushing these files without the clipboard

The paste into the Apps Script editor was dropping the first ~917 characters of the
file, mid-line. No file layout can survive that (a mid-line cut leaves a fragment
with no `//` in front of it, so it parses as code). This route removes the clipboard
from the process entirely.

## One-time setup

    npm install -g @google/clasp
    clasp login

## Push the Exec RAG report

Get the Script ID from the Apps Script editor: **Project Settings (gear) → IDs →
Script ID**.

    cd "c:\Users\backdrop\Downloads\Backdrop source\_clasp\exec-rag"
    clasp clone <SCRIPT_ID>      # answer "overwrite manifest?" with yes
    clasp push -f

## Push the GEO engine

Same, with that project's own Script ID:

    cd "c:\Users\backdrop\Downloads\Backdrop source\_clasp\geo-engine"
    clasp clone <SCRIPT_ID>
    clasp push -f

`clasp clone` pulls the project down and writes a `.clasp.json`; `clasp push -f`
then uploads `Code.js` over `Code.gs`. After that, every future update is one
command — no copying, nothing to truncate.

## Notes

- `Code.js` in each folder IS the module. clasp uploads `.js` as `.gs`.
- Keep the two projects separate: they declare the same names (CONFIG, VERSION,
  num_, moneyFmt_, ...) and whichever loaded last would win.
- Re-copy after any edit:
      cp ../../exec-rag-report-apps-script.gs Code.js
      cp ../../geo-channel-performance-apps-script.gs ../geo-engine/Code.js
