-- Tous les réglages du jeu au même endroit : modifie ici pour équilibrer.
local Config = {}

Config.GameName = "ARENA CLASH"

--------------------------------------------------------------------------
-- Économie / progression
--------------------------------------------------------------------------
-- Chaque action rapporte de l'XP (affichée en « +100 ÉLIMINATION ») et des pièces.
Config.ScoreEvents = {
	Kill = { Label = "ÉLIMINATION", Xp = 100, Coins = 15 },
	Headshot = { Label = "TIR À LA TÊTE", Xp = 50, Coins = 5 },
	Assist = { Label = "ASSISTANCE", Xp = 40, Coins = 5 },
	Longshot = { Label = "LONGUE DISTANCE", Xp = 50, Coins = 5 },
	Revenge = { Label = "VENGEANCE", Xp = 50, Coins = 5 },
	FirstBlood = { Label = "PREMIER SANG", Xp = 100, Coins = 20 },
	MultiKill = { Label = "MULTI-KILL", Xp = 75, Coins = 10 },
	BountyKill = { Label = "CIBLE ABATTUE", Xp = 150, Coins = 50 },
	StreakEnded = { Label = "SÉRIE STOPPÉE", Xp = 75, Coins = 10 },
}
Config.StreakBountyPerKill = 5 -- pièces bonus par kill de série de la victime
Config.LevelUpCoins = 25 -- x niveau atteint
function Config.XpForLevel(level: number): number
	return 500 + (level - 1) * 150
end

--------------------------------------------------------------------------
-- Combat
--------------------------------------------------------------------------
Config.MaxHealth = 100
Config.RegenDelay = 5 -- secondes sans dégâts avant la régénération
Config.RegenPerSecond = 25
Config.HealOnKill = 25
Config.KillCreditWindow = 10 -- le dernier attaquant reçoit le kill pendant X s
Config.AssistWindow = 8
Config.RespawnTime = 4 -- inclut la killcam
Config.SpawnProtection = 2.5 -- ForceField au spawn (retiré dès que le joueur tire)
Config.LongshotDistance = 120
Config.MultiKillWindow = 4 -- secondes entre deux kills pour un double / triple kill
Config.MultiKillNames = { [2] = "DOUBLE KILL", [3] = "TRIPLE KILL", [4] = "QUADRA KILL", [5] = "CARNAGE" }

-- Validation anti-triche des tirs (côté serveur)
Config.Validation = {
	MaxOriginOffset = 10, -- distance max entre l'origine annoncée et la tête côté serveur
	HitTolerance = 9, -- marge (studs) entre la position touchée annoncée et la pièce côté serveur
	MinDirectionDot = 0.97, -- l'impact doit être dans l'axe du tir annoncé
	FireDelayTolerance = 0.75, -- accepte un tir si l'intervalle >= FireDelay * 0.75 (latence)
}

--------------------------------------------------------------------------
-- Déplacements
--------------------------------------------------------------------------
Config.Movement = {
	WalkSpeed = 16,
	SprintSpeed = 23,
	AdsSpeedScale = 0.6, -- multiplicateur de vitesse en visée
	DashCooldown = 2.5,
	DashPower = 70,
	DashDuration = 0.18,
}

--------------------------------------------------------------------------
-- Caméra (client)
--------------------------------------------------------------------------
Config.Camera = {
	BaseFov = 70,
	SprintFovBonus = 8,
	ShoulderOffset = Vector3.new(1.9, 0.45, 0),
	AdsShoulderOffset = Vector3.new(1.3, 0.35, 0),
	AimPitchSendRate = 10, -- envois par seconde de l'inclinaison de visée
}

--------------------------------------------------------------------------
-- Séries d'éliminations (récompenses activables)
--------------------------------------------------------------------------
Config.Killstreaks = {
	{
		Id = "Radar",
		Name = "RADAR",
		Kills = 4,
		Key = Enum.KeyCode.Three,
		Duration = 10, -- les ennemis sont visibles à travers les murs
		Description = "Révèle tous les ennemis à travers les murs",
	},
	{
		Id = "Orbital",
		Name = "FRAPPE ORBITALE",
		Kills = 8,
		Key = Enum.KeyCode.Four,
		Delay = 2.5, -- délai entre le marquage et l'impact
		Radius = 22,
		Damage = 250,
		MaxDistance = 600, -- distance max de la cible depuis le joueur
		Description = "Un rayon venu du ciel pulvérise la zone ciblée",
	},
}

-- Le joueur avec une grosse série devient une « cible » visible de tous.
Config.Bounty = {
	MinStreak = 5,
}

Config.StreakMessages = {
	[3] = "%s est en série de 3 ! 🔥",
	[5] = "%s est INARRÊTABLE ! (5) ⚡ — prime sur sa tête",
	[10] = "%s est LÉGENDAIRE ! (10) 👑",
	[15] = "%s domine l'arène ! (15) 💀",
	[25] = "%s est un DIEU ! (25) 🌌",
}

--------------------------------------------------------------------------
-- Récompense quotidienne (augmente chaque jour consécutif)
--------------------------------------------------------------------------
Config.DailyRewardCooldown = 20 * 3600
Config.DailyStreakReset = 48 * 3600
Config.DailyRewards = { 100, 150, 200, 300, 400, 600, 1000 }

--------------------------------------------------------------------------
-- Monétisation / badges (mets tes IDs, 0 = désactivé)
--------------------------------------------------------------------------
Config.VipGamepassId = 0
Config.VipCoinMultiplier = 2
Config.Badges = {
	FirstKill = 0,
	Streak10 = 0,
	Level10 = 0,
	Orbital = 0,
}

--------------------------------------------------------------------------
-- Sauvegarde
--------------------------------------------------------------------------
Config.DataStoreName = "ArenaClash_PlayerData_v2"
Config.LeaderboardStoreName = "ArenaClash_Kills_v2"
Config.AutosaveInterval = 120
Config.LeaderboardRefresh = 60

-- Paramètres joueur par défaut (sauvegardés)
Config.DefaultSettings = {
	Sensitivity = 1, -- 0.2 .. 3
	AdsSensitivity = 0.6, -- 0.2 .. 1.5 (multiplicateur en visée)
	Fov = 70, -- 60 .. 100
	DamageNumbers = true,
	CameraShake = true,
}

--------------------------------------------------------------------------
-- Sons. Une chaîne vide = son désactivé (le code doit l'ignorer proprement).
-- Mets des rbxassetid:// publics (Creator Store, audio créé par Roblox).
--------------------------------------------------------------------------
Config.Sounds = {
	Weapons = {
		Pistol = "",
		Magnum = "",
		SMG = "",
		Shotgun = "",
		Rifle = "",
		Sniper = "",
		LMG = "",
	},
	Reload = "",
	Empty = "",
	Equip = "rbxasset://sounds/unsheath.wav",
	Hitmarker = "",
	Headshot = "",
	Kill = "",
	LevelUp = "",
	Orbital = "",
	OrbitalCharge = "",
	Radar = "",
	Ui = "rbxasset://sounds/electronicpingshort.wav",
}

--------------------------------------------------------------------------
-- Couleurs de l'interface
--------------------------------------------------------------------------
Config.Colors = {
	Accent = Color3.fromRGB(0, 200, 255),
	Accent2 = Color3.fromRGB(255, 60, 140),
	Gold = Color3.fromRGB(255, 196, 60),
	Good = Color3.fromRGB(80, 220, 120),
	Bad = Color3.fromRGB(255, 70, 70),
	Headshot = Color3.fromRGB(255, 70, 70),
}

return Config
