-- Catalogue des armes. Le premier élément est l'arme gratuite de départ.
-- DPS volontairement proche entre armes : on achète du style et du confort, pas une victoire garantie.
local Weapons = {}

Weapons.List = {
	{
		Id = "Wooden",
		Name = "Épée en bois",
		Price = 0,
		Damage = 20,
		Cooldown = 0.55,
		Range = 6,
		Length = 3.2,
		Color = Color3.fromRGB(160, 115, 70),
		Material = Enum.Material.Wood,
	},
	{
		Id = "Iron",
		Name = "Lame de fer",
		Price = 300,
		Damage = 22,
		Cooldown = 0.52,
		Range = 6.5,
		Length = 3.6,
		Color = Color3.fromRGB(200, 205, 215),
		Material = Enum.Material.Metal,
	},
	{
		Id = "Katana",
		Name = "Katana",
		Price = 900,
		Damage = 18,
		Cooldown = 0.4,
		Range = 7,
		Length = 4,
		Color = Color3.fromRGB(235, 235, 245),
		Material = Enum.Material.Glass,
		TrailColor = Color3.fromRGB(255, 255, 255),
	},
	{
		Id = "Crystal",
		Name = "Épée de cristal",
		Price = 2500,
		Damage = 27,
		Cooldown = 0.58,
		Range = 7.5,
		Length = 4.2,
		Color = Color3.fromRGB(90, 200, 255),
		Material = Enum.Material.Neon,
		Glow = true,
	},
	{
		Id = "Inferno",
		Name = "Lame Inferno",
		Price = 6000,
		Damage = 24,
		Cooldown = 0.46,
		Range = 7.5,
		Length = 4.4,
		Color = Color3.fromRGB(255, 90, 30),
		Material = Enum.Material.Neon,
		Glow = true,
		TrailColor = Color3.fromRGB(255, 200, 60),
	},
	{
		Id = "Void",
		Name = "Faux du Néant",
		Price = 15000,
		Damage = 25,
		Cooldown = 0.45,
		Range = 8,
		Length = 4.8,
		Color = Color3.fromRGB(150, 60, 255),
		Material = Enum.Material.Neon,
		Glow = true,
		TrailColor = Color3.fromRGB(255, 60, 200),
	},
}

Weapons.ById = {}
for index, weapon in Weapons.List do
	weapon.Order = index
	Weapons.ById[weapon.Id] = weapon
end

Weapons.Default = Weapons.List[1]

return Weapons
