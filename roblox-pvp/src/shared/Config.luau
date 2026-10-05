-- Tous les réglages du jeu au même endroit : modifie ici pour équilibrer.
local Config = {}

Config.GameName = "ARENA CLASH"

-- Économie / progression
Config.StartingCoins = 0
Config.CoinsPerKill = 10
Config.StreakBountyPerKill = 5 -- bonus par kill de série de la victime (prime)
Config.AssistCoins = 4
Config.XpPerKill = 25
Config.LevelUpCoins = 10 -- x niveau atteint
function Config.XpForLevel(level: number): number
	return 100 + (level - 1) * 50
end

-- Combat
Config.CritChance = 0.1
Config.CritMultiplier = 1.5
Config.HealOnKill = 30
Config.KillCreditWindow = 10 -- secondes pendant lesquelles le dernier attaquant reçoit le kill
Config.AssistWindow = 8
Config.MaxTargetsPerSwing = 3
Config.KnockbackPower = 35
Config.RespawnTime = 3
Config.SpawnProtection = 3 -- ForceField au spawn (retiré si le joueur attaque)

-- Dash (touche Q / bouton mobile)
Config.DashCooldown = 2.5
Config.DashPower = 75
Config.DashDuration = 0.18

-- Séries annoncées à tout le serveur
Config.StreakMessages = {
	[3] = "%s est en série de 3 ! 🔥",
	[5] = "%s est INARRÊTABLE ! (5) ⚡",
	[10] = "%s est LÉGENDAIRE ! (10) 👑",
	[15] = "%s domine l'arène ! (15) 💀",
	[25] = "%s est un DIEU ! (25) 🌌",
}

-- Récompense quotidienne (augmente chaque jour consécutif)
Config.DailyRewardCooldown = 20 * 3600
Config.DailyStreakReset = 48 * 3600
Config.DailyRewards = { 50, 75, 100, 150, 200, 300, 500 }

-- Monétisation / badges (mets tes IDs, 0 = désactivé)
Config.VipGamepassId = 0
Config.VipCoinMultiplier = 2
Config.Badges = {
	FirstKill = 0,
	Streak10 = 0,
	Level10 = 0,
}

-- Sauvegarde
Config.DataStoreName = "ArenaClash_PlayerData_v1"
Config.LeaderboardStoreName = "ArenaClash_Kills_v1"
Config.AutosaveInterval = 120
Config.LeaderboardRefresh = 60

-- Sons intégrés au client Roblox (remplace par tes propres rbxassetid:// si tu veux)
Config.Sounds = {
	Slash = "rbxasset://sounds/swordslash.wav",
	Unsheath = "rbxasset://sounds/unsheath.wav",
	Hit = "rbxasset://sounds/swordlunge.wav",
	Ui = "rbxasset://sounds/electronicpingshort.wav",
}

-- Couleurs de l'interface
Config.Colors = {
	Accent = Color3.fromRGB(0, 200, 255),
	Accent2 = Color3.fromRGB(255, 60, 140),
	Gold = Color3.fromRGB(255, 196, 60),
	Good = Color3.fromRGB(80, 220, 120),
	Bad = Color3.fromRGB(255, 80, 80),
}

return Config
