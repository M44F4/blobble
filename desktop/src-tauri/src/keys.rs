// Optional keyboard shortcuts on Hyprland, as OmaBlob adds them: bound while Blobble runs through
// `hyprctl eval` (Hyprland's Lua config), never written to the user's config files. One for the ring
// and one for the panel; each runs `blobble --bar ring` or `blobble --bar toggle`.
use crate::sensors::linux::hypr;
use serde_json::Value;

// Hyprland's modifier bits, as names.
fn bind_name(b: &Value) -> String {
    let mask = b["modmask"].as_i64().unwrap_or(0);
    let mut out: Vec<String> = [(64, "SUPER"), (4, "CTRL"), (8, "ALT"), (1, "SHIFT")]
        .iter()
        .filter(|(bit, _)| mask & bit != 0)
        .map(|(_, n)| n.to_string())
        .collect();
    out.push(b["key"].as_str().unwrap_or("").to_uppercase());
    out.join(" + ")
}

fn lua(text: &str) -> String {
    format!("'{}'", text.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn binds() -> Vec<Value> {
    hypr("binds").and_then(|v| v.as_array().cloned()).unwrap_or_default()
}

fn ours(b: &Value) -> bool {
    b["description"].as_str().unwrap_or("").starts_with("Blobble")
}

// What else already uses these keys (a description), or nothing.
#[tauri::command]
pub fn keys_taken(combo: String) -> String {
    let want = combo.to_uppercase().replace(' ', "");
    binds()
        .iter()
        .filter(|b| !ours(b))
        .find(|b| bind_name(b).replace(' ', "") == want)
        .map(|b| b["description"].as_str().filter(|d| !d.is_empty()).or(b["arg"].as_str()).unwrap_or("something else").to_string())
        .unwrap_or_default()
}

// Binds the two shortcuts (an empty one is none), after unbinding Blobble's earlier ones.
#[tauri::command]
pub fn keys_apply(ring: String, popup: String) {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "blobble".into());
    let mut script: Vec<String> = binds().iter().filter(|b| ours(b)).map(|b| format!("pcall(hl.unbind, {})", lua(&bind_name(b)))).collect();
    let mut want = vec![];
    if !ring.is_empty() {
        want.push((ring.clone(), "Blobble ring", format!("{exe} --bar ring")));
    }
    if !popup.is_empty() && popup != ring {
        want.push((popup, "Blobble panel", format!("{exe} --bar toggle")));
    }
    for (keys, description, command) in want {
        script.push(format!("hl.bind({}, hl.dsp.exec_cmd({}), {{ description = {} }})", lua(&keys), lua(&command), lua(description)));
    }
    if script.is_empty() {
        return;
    }
    let _ = std::process::Command::new("hyprctl").arg("eval").arg(script.join("; ")).output();
}
