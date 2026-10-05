-- Petits helpers pour construire une interface propre et homogène en code.
local TweenService = game:GetService("TweenService")

local Ui = {}

Ui.Colors = {
	Background = Color3.fromRGB(16, 18, 26),
	Panel = Color3.fromRGB(26, 29, 40),
	PanelLight = Color3.fromRGB(38, 42, 58),
	Text = Color3.fromRGB(245, 246, 250),
	Muted = Color3.fromRGB(150, 155, 175),
}

Ui.Font = Enum.Font.GothamBold
Ui.FontBlack = Enum.Font.GothamBlack

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

function Ui.padding(px: number)
	local u = UDim.new(0, px)
	return Ui.new("UIPadding", { PaddingTop = u, PaddingBottom = u, PaddingLeft = u, PaddingRight = u })
end

function Ui.label(props)
	local defaults = {
		BackgroundTransparency = 1,
		Font = Ui.Font,
		TextColor3 = Ui.Colors.Text,
		TextScaled = true,
	}
	for key, value in props do
		defaults[key] = value
	end
	return Ui.new("TextLabel", defaults)
end

function Ui.tween(instance: Instance, time: number, goal, style: Enum.EasingStyle?)
	local tween = TweenService:Create(instance, TweenInfo.new(time, style or Enum.EasingStyle.Quint, Enum.EasingDirection.Out), goal)
	tween:Play()
	return tween
end

-- Bouton avec effet de survol / clic.
function Ui.button(props, color: Color3)
	local button = Ui.new("TextButton", {
		AutoButtonColor = false,
		BackgroundColor3 = color,
		Font = Ui.Font,
		TextColor3 = Ui.Colors.Text,
		TextScaled = true,
	}, { Ui.corner(10), Ui.padding(6) })
	for key, value in props do
		if key == "Parent" then
			continue
		end
		button[key] = value
	end
	local scale = Ui.new("UIScale", { Parent = button })
	button.MouseEnter:Connect(function()
		Ui.tween(scale, 0.15, { Scale = 1.05 })
	end)
	button.MouseLeave:Connect(function()
		Ui.tween(scale, 0.15, { Scale = 1 })
	end)
	button.MouseButton1Down:Connect(function()
		Ui.tween(scale, 0.08, { Scale = 0.95 })
	end)
	button.MouseButton1Up:Connect(function()
		Ui.tween(scale, 0.12, { Scale = 1.05 })
	end)
	if props.Parent then
		button.Parent = props.Parent
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
