-- Lecture de sons côté client. Ignore silencieusement les ids vides (Config.Sounds non rempli).
local Debris = game:GetService("Debris")
local SoundService = game:GetService("SoundService")

local Sfx = {}

local function valid(id: string?): boolean
	return type(id) == "string" and id ~= ""
end

-- Son « interface » (non spatialisé).
function Sfx.Play2D(id: string?, volume: number?, pitch: number?)
	if not valid(id) then
		return nil
	end
	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume or 0.5
	sound.PlaybackSpeed = pitch or 1
	sound.Parent = SoundService
	sound:Play()
	Debris:AddItem(sound, 6)
	return sound
end

-- Son 3D : at = BasePart, Attachment ou position Vector3.
-- variation = écart aléatoire de hauteur (ex. 0.05 => pitch entre 0.95 et 1.05).
function Sfx.PlayAt(id: string?, at: Instance | Vector3, volume: number?, variation: number?, maxDistance: number?)
	if not valid(id) then
		return nil
	end
	local parent: Instance
	if typeof(at) == "Vector3" then
		local attachment = Instance.new("Attachment")
		attachment.WorldPosition = at
		attachment.Parent = workspace.Terrain
		Debris:AddItem(attachment, 6)
		parent = attachment
	else
		parent = at
	end
	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume or 0.6
	local spread = variation or 0
	sound.PlaybackSpeed = 1 + (math.random() * 2 - 1) * spread
	sound.RollOffMode = Enum.RollOffMode.InverseTapered
	sound.RollOffMinDistance = 10
	sound.RollOffMaxDistance = maxDistance or 400
	sound.Parent = parent
	sound:Play()
	Debris:AddItem(sound, 6)
	return sound
end

return Sfx
