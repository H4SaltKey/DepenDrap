const fs = require('fs');
const gameJs = fs.readFileSync('/Users/admin/GitHub/DepenDrap_Online/js/game/game.js', 'utf8').split('\n');

function extract(start, end) {
  return gameJs.slice(start - 1, end).join('\n') + '\n';
}

const statusUI = extract(498, 705) + '\n' + extract(783, 867) + '\n' + extract(2771, 2881);
fs.writeFileSync('/Users/admin/GitHub/DepenDrap_Online/js/ui/statusUI.js', statusUI);

const overlayUI = extract(707, 781) + '\n' + extract(1898, 1934); // wait, where is showHandOverflowDiscardModal?
// I'll search for showHandOverflowDiscardModal later.
