class_name GameSystemsImporter
extends RefCounted
## Godot 4 data adapter for GSS schema 1, engine gss-combat/1.
## Reads design data only. It does NOT implement combat or convert .tres assets.
## Example: var imported = GameSystemsImporter.load_design("res://balance.json")
## if imported.ok: print(imported.data.build)

static func load_design(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "error": "File not found: " + path}
	return parse_design(FileAccess.get_file_as_string(path))

static func parse_design(source: String) -> Dictionary:
	var parser := JSON.new()
	if parser.parse(source) != OK:
		return {"ok": false, "error": parser.get_error_message()}
	var data = parser.data
	if not data is Dictionary:
		return {"ok": false, "error": "Expected an object"}
	if data.get("format") != "pt.game-systems-studio" or data.get("schemaVersion") != 1 or data.get("engineVersion") != "gss-combat/1":
		return {"ok": false, "error": "Unsupported schema or engine version"}
	var ids := {}
	var groups := {}
	for kind in ["characters", "enemies", "cards", "items", "encounters"]:
		var entries = data.get(kind)
		if not entries is Array or entries.is_empty() or entries.size() > 80:
			return {"ok": false, "error": "Invalid group: " + kind}
		groups[kind] = {}
		for entry in entries:
			if not entry is Dictionary or not entry.get("id") is String or not entry.get("name") is String:
				return {"ok": false, "error": "Invalid identity in " + kind}
			var entry_id: String = entry.id
			if entry_id.is_empty() or ids.has(entry_id):
				return {"ok": false, "error": "Empty or duplicate ID: " + entry_id}
			ids[entry_id] = true
			groups[kind][entry_id] = entry
	var build = data.get("build")
	var scenario = data.get("scenario")
	if not build is Dictionary or not scenario is Dictionary:
		return {"ok": false, "error": "Missing build/scenario"}
	if not groups.characters.has(build.get("characterId")) or not groups.encounters.has(scenario.get("encounterId")):
		return {"ok": false, "error": "Missing character/encounter reference"}
	if not build.get("deck") is Array or not build.get("itemIds") is Array:
		return {"ok": false, "error": "Invalid deck/equipment"}
	for entry in build.deck:
		if not entry is Dictionary or not groups.cards.has(entry.get("cardId")) or not entry.get("count") is float and not entry.get("count") is int:
			return {"ok": false, "error": "Invalid card reference/count"}
		if entry.count < 1 or entry.count > 10 or entry.count != floor(entry.count):
			return {"ok": false, "error": "Invalid card count"}
	for item_id in build.itemIds:
		if not groups.items.has(item_id):
			return {"ok": false, "error": "Missing item reference"}
	for encounter in data.encounters:
		if not encounter.get("enemies") is Array:
			return {"ok": false, "error": "Invalid encounter"}
		for entry in encounter.enemies:
			if not entry is Dictionary or not groups.enemies.has(entry.get("enemyId")):
				return {"ok": false, "error": "Missing enemy reference"}
	return {"ok": true, "data": data}
