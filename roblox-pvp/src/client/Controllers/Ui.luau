-- Helpers pour construire une interface propre et homogène en code.
-- Style : panneaux sombres translucides (« verre »), accents cyan / magenta, titres Oswald, texte Gotham.
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Ui = {}

Ui.Colors = {
	Background = Color3.fromRGB(10, 12, 18),
	Panel = Color3.fromRGB(20, 23, 32),
	PanelLight = Color3.fromRGB(34, 38, 52),
	Text = Color3.fromRGB(245, 246, 250),
	Muted = Color3.fromRGB(150, 156, 176),
	Accent = Config.Colors.Accent,
	Accent2 = Config.Colors.Accent2,
	Gold = Config.Colors.Gold,
	Good = Config.Colors.Good,
	Bad = Config.Colors.Bad,
}

local GOTHAM = "rbxasset://fonts/families/GothamSSm.json"
local OSWALD = "rbxasset://fonts/families/Oswald.json"

Ui.Fonts = {
	Title = Font.new(OSWALD, Enum.FontWeight.Bold), -- gros titres, chiffres de munitions
	Heading = Font.new(OSWALD, Enum.FontWeight.Medium),
	Body = Font.new(GOTHAM, Enum.FontWeight.Medium),
	Bold = Font.new(GOTHAM, Enum.FontWeight.Bold),
	Heavy = Font.new(GOTHAM, Enum.FontWeight.Heavy),
}

-- Crée une instance : Ui.new("Frame", { Size = ..., Parent = ... }, { enfants })
function Ui.new(className: string, props, children)
	local instance = Instance.new(className)
	local parent
	for key, value in props or {} do
		if key == "Parent" then
			parent = value
		else
			instance[key] = value
		end
	end
	for _, child in children or {} do
		child.Parent = instance
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function Ui.corner(radius: number?)
	return Ui.new("UICorner", { CornerRadius = UDim.new(0, radius or 10) })
end

function Ui.stroke(color: Color3?, thickness: number?, transparency: number?)
	return Ui.new("UIStroke", {
		Color = color or Color3.new(1, 1, 1),
		Thickness = thickness or 1.5,
		Transparency = transparency or 0.85,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function Ui.padding(px: number, horizontal: number?)
	local v = UDim.new(0, px)
	local h = UDim.new(0, horizontal or px)
	return Ui.new("UIPadding", { PaddingTop = v, PaddingBottom = v, PaddingLeft = h, PaddingRight = h })
end

function Ui.gradient(a: Color3, b: Color3, rotation: number?)
	return Ui.new("UIGradient", { Color = ColorSequence.new(a, b), Rotation = rotation or 0 })
end

function Ui.list(direction: Enum.FillDirection?, padding: number?, props)
	local layout = Ui.new("UIListLayout", {
		FillDirection = direction or Enum.FillDirection.Vertical,
		Padding = UDim.new(0, padding or 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
	})
	for key, value in props or {} do
		layout[key] = value
	end
	return layout
end

-- Panneau « verre » standard.
function Ui.panel(props, children)
	local defaults = {
		BackgroundColor3 = Ui.Colors.Background,
		BackgroundTransparency = 0.2,
		BorderSizePixel = 0,
	}
	for key, value in props or {} do
		defaults[key] = value
	end
	local frame = Ui.new("Frame", defaults, children)
	if not frame:FindFirstChildOfClass("UICorner") then
		Ui.corner(12).Parent = frame
	end
	if not frame:FindFirstChildOfClass("UIStroke") then
		Ui.stroke(Color3.new(1, 1, 1), 1, 0.88).Parent = frame
	end
	return frame
end

function Ui.label(props, children)
	local defaults = {
		BackgroundTransparency = 1,
		FontFace = Ui.Fonts.Bold,
		TextColor3 = Ui.Colors.Text,
		TextScaled = true,
		BorderSizePixel = 0,
	}
	for key, value in props or {} do
		defaults[key] = value
	end
	return Ui.new("TextLabel", defaults, children)
end

function Ui.tween(instance: Instance, time: number, goal, style: Enum.EasingStyle?, direction: Enum.EasingDirection?)
	local tween = TweenService:Create(
		instance,
		TweenInfo.new(time, style or Enum.EasingStyle.Quint, direction or Enum.EasingDirection.Out),
		goal
	)
	tween:Play()
	return tween
end

-- Bouton avec effet de survol / clic. color = couleur de fond.
function Ui.button(props, color: Color3?)
	local button = Ui.new("TextButton", {
		AutoButtonColor = false,
		BackgroundColor3 = color or Ui.Colors.PanelLight,
		FontFace = Ui.Fonts.Title,
		TextColor3 = Ui.Colors.Text,
		TextScaled = true,
		BorderSizePixel = 0,
	}, { Ui.corner(10), Ui.padding(6, 10) })
	local parent
	for key, value in props or {} do
		if key == "Parent" then
			parent = value
		else
			button[key] = value
		end
	end
	local scale = Ui.new("UIScale", { Parent = button })
	button.MouseEnter:Connect(function()
		Ui.tween(scale, 0.15, { Scale = 1.04 })
	end)
	button.MouseLeave:Connect(function()
		Ui.tween(scale, 0.15, { Scale = 1 })
	end)
	button.MouseButton1Down:Connect(function()
		Ui.tween(scale, 0.08, { Scale = 0.95 })
	end)
	button.MouseButton1Up:Connect(function()
		Ui.tween(scale, 0.12, { Scale = 1.04 })
	end)
	if parent then
		button.Parent = parent
	end
	return button
end

function Ui.formatNumber(n: number): string
	local s = tostring(math.floor(n))
	local formatted = s:reverse():gsub("(%d%d%d)", "%1 "):reverse()
	return (formatted:gsub("^ ", ""))
end

function Ui.formatTime(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return string.format("%02d:%02d:%02d", seconds // 3600, (seconds % 3600) // 60, seconds % 60)
end

return Ui
