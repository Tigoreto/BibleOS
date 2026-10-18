# BOS-1 Protocol Interface Standard (Draft)
Version: 0.1a
Status: Experimental / Pre-Testnet
Applies to: Layer 1 Universal Connection Layer

## 1. 原则
BOS-1 是一种去中心化的、默认无云连接的(device-to-node)短距/网状通信标准。任何兼容 BOS-1 的设备必须：
1. **Zero Phone-Home**：决不允许默认上报数据给设备制造商。
2. **Sovereign Signing**：所有数据出站前必须带有自身设备的 DID 或者经所有者分发的子 DID 签名。

## 2. 最小连接握手
当一个新设备 (如 Android 轻节点或 IoT 设备) 试图连接到主节点 (Geniux OS) 服务器时，它必须在第一次 TCP / WebSocket 握手时投递以下载荷。

### 2.1 身份与意图交换
```json
{
  "bos_version": "1.0",
  "device_id": "did:key:z6MkhaXgBZDvotDkL5257faiztiuC2ZX...",
  "owner_id": "did:key:z6Mk...",
  "routing_declaration": {
    "allowed_destinations": ["did:key:z6Mk..."],
    "blocked_destinations": ["*"]
  },
  "timestamp_utc": 1710582000,
  "signature": "Hex/Base58 encoded Ed25519 signature over the above fields"
}
```

### 2.2 数据交换载荷格式
握手成功后，所有的 Sensor Data 或 Intent 请求均需封装在数据包中，主权节点 (如 Geniux OS) 收到后会验证 `owner_id` 并将其写入 Reality Ledger 的 `action` 和 `context_hash` 记录内。

```json
{
  "packet_id": "uuid/hash",
  "device_id": "did:key:...",
  "timestamp": 1710582005,
  "payload_type": "sensor.visual | intent.natural_language | state.update",
  "payload": { ... },
  "signature": "..."
### 2.3 零配置签名验签验证规范
BOS-1 连接的一个绝对核心是：接纳方如何信任投递方？
根据 W3C `did:key` 规范，验证方收到数据包后无需求助任何中心化注册表，即可执行密码学验证：
1. 取出包头中的 `device_id` (例如 `did:key:z6Mk...`)。
2. 切除 `did:key:z` 前缀，获取剩余的 Base58BTC 编码串。
3. Base58BTC 解码后得到 `字节数组`，丢弃最前面的多重编码前缀 (`0xED 0x01`)，剩下的紧凑 32 bytes 即为该设备的 **Ed25519 公钥**。
4. 验证引擎从 Payload 提取 `signature`，并验证 Payload 原文 (`canonical_json()`) 的哈希确实由该公共钥签署。如果失败，立即熔断连接并拒绝分配通道资源。

## 3. 下一步设计
- **非信任连接降级**：当无法完全验证加密学签名时的内网设备降级处理策略。
- **跨公网情况下的隧道打洞**：如何在缺乏公网 IP 情况下，使手机设备通过 P2P 隧道连接家中的 Geniux OS Node。
