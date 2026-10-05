-- Camouflages d'armes : chaque camouflage se débloque avec un nombre de kills réalisés AVEC cette arme.
-- GunBuilder applique le camouflage aux pièces marquées de l'attribut Camo = true (le « corps » de l'arme).
-- Animated = true : les pièces reçoivent le tag CollectionService "AnimatedCamo" et le client fait défiler les couleurs.
local Camos = {}

Camos.List = {
	{ Id = "Default", Name = "Standard", Kills = 0 },
	{
		Id = "Carbon",
		Name = "Carbone",
		Kills = 15,
		Color = Color3.fromRGB(32, 33, 38),
		Material = Enum.Material.Fabric,
	},
	{
		Id = "Arctic",
		Name = "Arctique",
		Kills = 40,
		Color = Color3.fromRGB(226, 236, 246),
		Material = Enum.Material.SmoothPlastic,
	},
	{
		Id = "Crimson",
		Name = "Cramoisi",
		Kills = 75,
		Color = Color3.fromRGB(150, 18, 36),
		Material = Enum.Material.Metal,
	},
	{
		Id = "Gold",
		Name = "Or",
		Kills = 120,
		Color = Color3.fromRGB(255, 196, 64),
		Material = Enum.Material.Foil,
		Reflectance = 0.2,
	},
	{
		Id = "Diamond",
		Name = "Diamant",
		Kills = 250,
		Color = Color3.fromRGB(160, 235, 255),
		Material = Enum.Material.Glass,
		Reflectance = 0.25,
	},
	{
		Id = "Nebula",
		Name = "Nébuleuse",
		Kills = 500,
		Color = Color3.fromRGB(150, 60, 255),
		Material = Enum.Material.Neon,
		Animated = true,
	},
}

Camos.ById = {}
for index, camo in Camos.List do
	camo.Order = index
	Camos.ById[camo.Id] = camo
end

function Camos.IsUnlocked(camoId: string, weaponKills: number): boolean
	local camo = Camos.ById[camoId]
	return camo ~= nil and (weaponKills or 0) >= camo.Kills
end

return Camos
