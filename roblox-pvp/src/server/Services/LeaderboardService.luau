-- Tableau « Top Kills » global affiché dans l'arène (OrderedDataStore).
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local LeaderboardService = {}

local ROWS = 10
local nameCache = {}

local function getName(userId: number): string
	if nameCache[userId] then
		return nameCache[userId]
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	local result = if ok then name else "???"
	nameCache[userId] = result
	return result
end

local function buildGui(board: BasePart)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.LightInfluence = 0
	gui.Brightness = 1.5

	local background = Instance.new("Frame")
	background.Size = UDim2.fromScale(1, 1)
	background.BackgroundColor3 = Color3.fromRGB(14, 16, 24)
	background.BackgroundTransparency = 0.1
	background.Parent = gui

	local title = Instance.new("TextLabel")
	title.Size = UDim2.fromScale(1, 0.16)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamBlack
	title.TextScaled = true
	title.TextColor3 = Config.Colors.Gold
	title.Text = "🏆 TOP KILLS"
	title.Parent = background

	local list = Instance.new("Frame")
	list.Position = UDim2.fromScale(0.05, 0.18)
	list.Size = UDim2.fromScale(0.9, 0.8)
	list.BackgroundTransparency = 1
	list.Parent = background

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.01, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list

	local rows = {}
	for i = 1, ROWS do
		local row = Instance.new("TextLabel")
		row.LayoutOrder = i
		row.Size = UDim2.fromScale(1, 0.09)
		row.BackgroundColor3 = if i % 2 == 0 then Color3.fromRGB(30, 34, 48) else Color3.fromRGB(24, 27, 38)
		row.Font = Enum.Font.GothamBold
		row.TextScaled = true
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.TextColor3 = if i == 1
			then Config.Colors.Gold
			elseif i == 2 then Color3.fromRGB(210, 215, 225)
			elseif i == 3 then Color3.fromRGB(215, 140, 80)
			else Color3.new(1, 1, 1)
		row.Text = string.format("  #%d  —", i)
		row.Parent = list
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.2, 0)
		corner.Parent = row
		rows[i] = row
	end

	gui.Parent = board
	return rows
end

function LeaderboardService.Init()
	local arena = workspace:FindFirstChild("Arena")
	local board = arena and arena:FindFirstChild("Leaderboard")
	if not board then
		return
	end

	local rows = buildGui(board)
	local ok, store = pcall(function()
		return DataStoreService:GetOrderedDataStore(Config.LeaderboardStoreName)
	end)
	if not ok then
		return
	end

	task.spawn(function()
		while true do
			local success, page = pcall(function()
				return store:GetSortedAsync(false, ROWS):GetCurrentPage()
			end)
			if success then
				for i = 1, ROWS do
					local entry = page[i]
					if entry then
						local name = getName(tonumber(entry.key) or 0)
						rows[i].Text = string.format("  #%d  %s  •  %d kills", i, name, entry.value)
					else
						rows[i].Text = string.format("  #%d  —", i)
					end
				end
			end
			task.wait(Config.LeaderboardRefresh)
		end
	end)
end

return LeaderboardService
