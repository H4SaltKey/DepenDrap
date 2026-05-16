import re

with open('/Users/admin/GitHub/DepenDrap_Online/js/game/game.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def get_function(func_name):
    start = -1
    end = -1
    open_braces = 0
    in_func = False
    for i, line in enumerate(lines):
        if not in_func and re.match(r'^(async\s+)?function\s+' + func_name + r'\s*\(', line):
            start = i
            in_func = True
        
        if in_func:
            open_braces += line.count('{')
            open_braces -= line.count('}')
            if open_braces == 0 and line.strip() == '}':
                end = i
                return "".join(lines[start:end+1])
    return ""

def get_consts(*names):
    res = []
    for line in lines:
        for n in names:
            if line.startswith(f"const {n}"):
                res.append(line)
    return "".join(res)

status_funcs = ["barPct", "renderBarRow", "renderLevelRow", "renderNumRow", "renderOwnerUI", "countOwnerHandCardsOnField", "getHandLimit", "lorStatChip", "lorLucide", "lorInstantDefStatRow", "updateFieldStatusPanels"]
status_code = ""
for f in status_funcs:
    status_code += get_function(f) + "\n"
status_code += "window.getHandLimit = getHandLimit;\n\n"
status_code += get_consts("ICON_BARRIER", "ICON_HP", "ICON_SLD", "ICON_ATK", "ICON_DEF")

overlay_funcs = ["openEvolutionPathModal", "getEvolutionPathHTML", "showHandOverflowDiscardModal"]
overlay_code = ""
for f in overlay_funcs:
    overlay_code += get_function(f) + "\n"

anim_funcs = ["showNotification", "showRoundNotification"]
anim_code = ""
for f in anim_funcs:
    anim_code += get_function(f) + "\n"

chat_funcs = ["updateGameLogs", "checkAndLogStateChanges", "handleChatSend", "setupChatUI"]
chat_code = ""
for f in chat_funcs:
    chat_code += get_function(f) + "\n"

import os
os.makedirs("/Users/admin/GitHub/DepenDrap_Online/js/ui", exist_ok=True)
os.makedirs("/Users/admin/GitHub/DepenDrap_Online/js/chat", exist_ok=True)

with open("/Users/admin/GitHub/DepenDrap_Online/js/ui/statusUI.js", "w", encoding="utf-8") as f:
    f.write(status_code)
with open("/Users/admin/GitHub/DepenDrap_Online/js/ui/overlayUI.js", "w", encoding="utf-8") as f:
    f.write(overlay_code)
with open("/Users/admin/GitHub/DepenDrap_Online/js/ui/animationUI.js", "w", encoding="utf-8") as f:
    f.write(anim_code)
with open("/Users/admin/GitHub/DepenDrap_Online/js/chat/chatUI.js", "w", encoding="utf-8") as f:
    f.write(chat_code)

print("Extracted successfully.")
