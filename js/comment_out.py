import re

with open('/Users/admin/GitHub/DepenDrap_Online/js/game/game.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def comment_function(func_name, label):
    start = -1
    end = -1
    open_braces = 0
    in_func = False
    for i, line in enumerate(lines):
        if not in_func and re.match(r'^(async\s+)?function\s+' + func_name + r'\s*\(', line) and not line.startswith("//"):
            start = i
            in_func = True
        
        if in_func:
            open_braces += line.count('{')
            open_braces -= line.count('}')
            lines[i] = "// " + line
            if open_braces == 0 and line.replace('//', '').strip() == '}':
                end = i
                in_func = False
                lines.insert(start, f"// LEGACY: moved to {label}\n")
                return True
    return False

def comment_const(name, label):
    for i, line in enumerate(lines):
        if line.startswith(f"const {name}") and not line.startswith("//"):
            lines[i] = "// " + line
            lines.insert(i, f"// LEGACY: moved to {label}\n")
            return True
    return False

def comment_line(match_str, label):
    for i, line in enumerate(lines):
        if line.startswith(match_str) and not line.startswith("//"):
            lines[i] = "// " + line
            lines.insert(i, f"// LEGACY: moved to {label}\n")
            return True
    return False

status_funcs = ["barPct", "renderBarRow", "renderLevelRow", "renderNumRow", "renderOwnerUI", "countOwnerHandCardsOnField", "getHandLimit", "lorStatChip", "lorLucide", "lorInstantDefStatRow", "updateFieldStatusPanels"]
for f in status_funcs:
    comment_function(f, "js/ui/statusUI.js")

comment_const("ICON_BARRIER", "js/ui/statusUI.js")
comment_const("ICON_HP", "js/ui/statusUI.js")
comment_const("ICON_SLD", "js/ui/statusUI.js")
comment_const("ICON_ATK", "js/ui/statusUI.js")
comment_const("ICON_DEF", "js/ui/statusUI.js")
comment_line("window.getHandLimit = getHandLimit;", "js/ui/statusUI.js")

overlay_funcs = ["openEvolutionPathModal", "getEvolutionPathHTML", "showHandOverflowDiscardModal"]
for f in overlay_funcs:
    comment_function(f, "js/ui/overlayUI.js")

anim_funcs = ["showNotification", "showRoundNotification"]
for f in anim_funcs:
    comment_function(f, "js/ui/animationUI.js")

chat_funcs = ["updateGameLogs", "checkAndLogStateChanges", "handleChatSend", "setupChatUI"]
for f in chat_funcs:
    comment_function(f, "js/chat/chatUI.js")

with open('/Users/admin/GitHub/DepenDrap_Online/js/game/game.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Commented out successfully.")
