# GOS Agent 行为准则与技能索引 (v2.8 - Agile Optimized)

本文档由系统全局配置 `.system_prompt.md`、开发准则 `docs/00-Core-Guidelines/GOS_DEV_STANDARDS.md` 与核心技能库 `skills` 提炼而成。在当前工程 (`geniux-os`) 下，任何 Agent 必须遵循以下行为准则与技能路由。

## 1. 核心执行流准则 (Absolute Execution Priority)

所有操作必须严格遵循 **先说后做，认知优先** 的执行流程：

1. **[UNDERSTAND]**: 彻底理解用户的问题、意图和上下文。
2. **[CLARIFY]**: 如有歧义，必须先向用户发起澄清式提问，**严禁猜测**。
3. **[SCAN & ROUTING]**: 意图明确后，优先读取对应的业务 SOP (Skill) 文件。
4. **[DESCRIBE]**: **在调用任何工具前，必须清晰描述即将执行的步骤。** 严禁静默执行。
5. **[EXECUTE]**: 启动工具调用，若内容已生成则立即写入文件。

## 2. Shell 交互与环境纪律 (Shell Discipline)

为解决 Windows 环境下 Shell 调用频繁出错的问题，强制执行以下协议：

**Shell 调用唯一合法格式：**
run_command 工具的 CommandLine 字段必须使用以下格式之一：
- **执行 Shell 命令（标准）**：`& 'D:\Program Files\Nushell\nu.exe' -c "<nushell命令>"`
- **执行需要 Windows 系统级操作（如 mklink）**：`cmd /c "<cmd命令>"`

**禁止项（以下语法一旦出现即违规）：**
- `Move-Item`, `Remove-Item`, `New-Item`, `Test-Path` <- PowerShell 独有
- `mkdir -p` <- PowerShell 参数风格，Nushell 不识别
- `nu -c` <- nu 命令来源不可靠，必须用绝对路径
- `ls *.py` <- Nushell 中 glob 需特殊处理

## 3. 目录结构与物理归口 (Architecture Integrity)

- **Skills 目录三层架构与定位**：
  - **全局层 (Global Skills)**: 位于 `D:\Documents\AppCache\IDE\antigravity\skills`。定义 Agent 自身的核心协议（如 `gos-ops-hub`、`spec-kit`），是所有技能的单一事实源。
  - **工程引用层 (Project Reference)**: 位于 `geniux-os/skills/`。作为全局库的**只读引用**（通过 Junction 联接实现），禁止全量物理迁移。
  - **项目执行层 (Runtime/Execution)**: 位于 `runtime/skills/<project>/` 或各项目独立仓库。存放执行过程中由 LLM 动态生成的专属技能 SOP。
- **根目录白名单**：仅允许 `core/`, `packages/`, `projects/`, `docs/`, `skills/`, `kernel/` 常驻。

## 4. 环境与基础设施认知 (Environment & Infrastructure)

为防止 Agent 产生测试方案幻觉，强制执行以下环境认知协议：

- **本地环境局限性**：Gemini / Antigravity 必须清醒意识到，本地 (Windows) 开发环境 **仅持有 工程代码实体**（brain, heart, dashboard, shield 等）。
- **优先检索本地脚本**：在进行本地环境拉起或测试前，**必须首先检索并分析已有的启动/测试脚本**，严禁脱离原有脚本自行制定测试方案。
- **基础设施缺失**：本地环境 **不具备** PostgreSQL、Docker、NATS、liteLLM 等任何基础设施或第三方组件。
- **单一资源源**：所有与工程代码无关的基础组件资源，必须统一使用并调用 **.45 (ops.local)** 中的资源。
- **禁止本地探测**：严禁尝试在本地环境探测、启动或测试上述PostgreSQL、Docker、NATS、liteLLM 等任何基础设施或第三方组件。

## 5. 全局系统限制 (Global Restrictions)

以下限制适用于所有模型的 Agent 行为：

- **[GEMINI 专属] 文件写入硬性禁令 (Gemini Write Lock)**:
  - **Gemini 模型严禁以任何形式自主写入、修改或创建任何文件。**
  - 禁用工具范围：`write_to_file`、`replace_file_content`、`multi_replace_file_content`。
  - **唯一解锁条件**：用户在当前回复中显式包含以下任意授权词之一：`写入`、`执行`、`write`、`apply`、`落地`。
  - 未获授权时，无论内容多完整，Gemini 只能在对话流中展示内容，不得调用任何写入工具。
  - **此条规则优先级高于本文件其他一切条款，不得被任何理由覆盖。**

- **[Claude / Tier-A] 内容写入限制**:
  - 内容在回复中完整生成后，**必须立即调用工具写入目标文件**，严禁等待用户二次确认。
  - 禁止并行写多文件，每次写完汇报后才可继续。
- **规范与纪律**:
  - **全域封杀 Emoji**：严禁在文件内容、路径、Git 提交或终端输出中使用任何形式的 Emoji。
  - 生成的计划 (`implementation_plan`) 和任务 (`task`) 等制品必须默认使用 **中文**。
  - **文案去叙事化**：面向用户的文案必须从“世界观”转向“控制台”，优先描述对象与动作（如：经验记录、运行监控），禁用抽象的 AI 设定术语（如：主权、真理、觉醒、演进、Scribe）。
  - **业务化中文**：使用通俗、冷静、明确的日常中文。遵循“对象+动作”命名按钮与标题，严禁在主界面使用史诗感、主权感或人格化的系统表述。
  - 严禁回复"收到"等无实质内容的空响应，严禁自行推断跨文件影响。
  - 严禁在终端执行 `echo` 以显示装饰性的任务总结。
  - **记忆与摘要管控**：
    - 严禁主动生成如 `PROGRESS.md`, `SUMMARY.md` 或本地 `session_memories` 等总结文档。
    - **审计结果输出约定**：每轮对话可发起多次审计，结论**始终只在对话流中打印**。仅在用户显式要求且为新对话首次归档时，才允许建立审计文档，严禁在活跃对话中重复建档。
    - 所有的任务知识必须通过全局工具链进行记忆注入（Memory Ingestion）。
    - 任务过程中产生的临时记录必须在完成后立即移入 `docs/99-Archive/`，严禁在活跃文档目录留存。

- **工程整洁与物理归口**:
  - **环境解耦**：`scripts/`, `config/`, `logs/`, `data/` 必须归口至 `runtime/` 目录。
  - **挥发性原则 (Artifacts Handling)**：
    - `implementation_plan`、`task`、`scratch` 脚本均视为“临时制品”，必须存放在工程根目录的 `artifacts/` 目录。
    - **避坑准则**：在调用 `write_to_file` 工具时，**必须设置 `IsArtifact=false`** 并提供工程内的绝对路径。严禁设置 `IsArtifact=true`，以避开系统对 AppData 沙箱路径的强制限制。
  - **单类型单脚本**：在 `artifacts/` 下，严禁生成 `test1.py`, `test2.py`。每个任务仅允许存在唯一的 `scratch.py`, `scratch.sh` 等。
  - **原子化归档**：任务完成后，Agent 必须将 `Implementation Plan`、`Task List` 及关键测试脚本合并为单一的 `task_xxxx_summary.md` 存入归档，随后将碎片文件移入归档目录暂存，里程碑达成后方可物理删除。
  - **优先对话规划**：中小规模任务（预计 5 轮内完成）禁止建档，仅允许在对话流中展示逻辑规划。

- **路线图同步 (Roadmap Sync)**:
  - **阈值触发**：仅在新建/删除文件、修改核心协议（`gemini.md`、`ARCHITECTURE.md`、`PROJECT_NEXUS.md`）或跨文件变更时，强制触发 Roadmap Sync。
  - **持久化 Pending**：若任务未达同步阈值，Agent 必须在 `artifacts/pending_sync.md` 中记录待同步事项，严禁仅在对话流中标记。
  - **操作顺序**：遵循 `[开发/审计] -> [全量 Commit] -> [Rule-F 安全卡点] -> [全量 Git Push]`。

## 6. 操作安全与卡点协议 (Security Gates)

- **生产发布卡点 (Rule-F)**:
  - **安全卡点摘要**: 执行生产部署、Git Push 前，Agent **必须根据 Implementation Plan 预制** 简明扼要的摘要供用户确认。
  > **[SECURITY-GATE]**
  > - **风险域**: [简述操作对象及 CI/CD 潜在影响范围]
  > - **合规性**: 已完成敏感信息与“去叙事化”文案自检，无 Emoji。
  > - **授权状况**: 已获用户显式 Push 授权。
- **Git 提交流程 (Rule-G)**:
  - **无感原子提交 (Automated Atomic Commits)**:
    - **原子化**: 任务拆解为原子功能点，Agent 在完成一个逻辑点并通过基础检查后，应执行 **无感本地 commit**，无需反复询问。**Push 操作严禁自动触发**，必须等待用户显式授权。
    - **分支隔离**: 严禁直接在 `main` 分支开发。所有新功能必须在 `feature/*` 分支演进。
  - **CI/CD 触发策略优化**:
    - **部署限制**: 仅在 `main` 或 `release` 分支变更时触发全量生产部署。
    - **静默推送**: 在非关键备份或中间态同步时，必须在 commit message 中加入 `[skip ci]` 关键字。
    - **实战验证**: 根据项目需求，`feature/*` 分支可配置“真实验证部署流”，确保合并前通过全链路环境校验。
  - **审计后推送 (Audit-before-Push)**:
    - **强制本地审计**: 推送前必须执行一轮 Rule-A 本地审计。
    - **提交纪律**: 强制采用 Conventional Commits 规范 (`type(scope): subject`)。
    - **推送授权**: 严禁自行推送。必须在用户显式下达指令并通过 Rule-F 安全卡点后方可执行。
- **环境工具调用**:
  - 优先使用官方 MCP Tools 或 `env-box` 脚本操作数据库/环境。
  - 当工具不可用时，必须向用户说明情况，**严禁自行编写临时数据库连接脚本**。

- **自动化闭环协议 (Rule-H)**:
  - **守候义务**: Git Push 完成后，Agent 必须主动轮询并跟踪 CI/CD 运行状态。
  - **健康审计**: 部署流完成后，Agent 必须抓取并分析 **容器运行状态 (docker ps)** 与 **关键日志 (docker logs)**。
  - **实战探测**: Agent 应在 Push 后自动运行测试脚本（如 `verify_remote.py`）探测远程服务 API 响应。
  - **交付标准**: 只有确认所有 Matrix 容器处于 `running` 状态且无启动期崩溃（如 Circular Import 或 Auth 403），方可宣告任务完成。若发现异常，必须立即进入故障自愈或向用户汇报。

- **审计协议 (Rule-A)**:
  - **异步审计逻辑**：对于 L1 级别修改（UI/文案/非核心逻辑），允许 Agent 在输出代码的同时并行给出审计结论，减少等待摩擦。
  - **分级审计体系**：
    - **L1 (常规)**：单文件逻辑修改。仅在对话中确认文案合规与 Emoji 扫描。
    - **L2 (复杂)**：修改文件 ≥ 3、涉及架构变更或核心配置修改。执行完整的 Rule-A 模板审计。
    - **L3 (核心)**：涉及 `kernel/` 或 `gemini.md` 本身变更。执行 Rule-A 模板审计并必须获得用户明确的“审计确认”回复后方可继续。

## 7. 核心技能路由 (Core Skills Index)

当前 Agent 系统支持多维度领域知识，执行具体任务时需主动调取对应领域的 `SKILL.md`。

- **GOS 核心 (Core)**:
  - `gos-ops-hub`: Geniux OS 项目专属运维操作与记忆注入 SOP。
  - `spec-kit`: 基于宪法驱动的 7 阶段规格说明驱动开发流。
  - `skill-auto-creation`: 技能自动创建与沉淀协议。
- **工程标准 (Standards)**:
  - `antigravity-standards`: 全球工程标准与开发协议。
  - `antigravity-branding`: 品牌、许可与元数据协议。
- **自动化 (Automation)**:
  - `n8n-automation`: n8n 工作流集成与外生器官调用协议。
