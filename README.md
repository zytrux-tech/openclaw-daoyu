# daoyu

Daoyu channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

Daoyu is a 3D chat software product focused on AI-powered conversational experiences.

- Product website: [aidaoyu.cn](http://aidaoyu.cn/)
- Company website: [zytrux.com](http://zytrux.com/)

> **Repository / 仓库地址**: [zytrux-tech/openclaw-daoyu](https://github.com/zytrux-tech/openclaw-daoyu)
>
> **Issue Reporting / 问题反馈**: Please open an Issue in the repository if installation, connection, or signing fails.  
> 如遇安装、连接、签名校验问题，请在仓库中提交 Issue。
>
> **Production Only / 仅支持正式环境**: This plugin is designed for production deployment only. Use `https://` / `wss://` only.  
> 本插件仅面向正式环境发布与使用，只支持 `https://` / `wss://`。

[English](#english) | [中文](#中文)

---

## English

### Features

1. `appId/appSecret` bot authentication
2. persistent WebSocket connection to Daoyu server
3. signed inbound and outbound frames
4. multi-account support
5. isolated session context per `accountId`
6. runtime token cache with persisted `deviceId`

### Installation

Install from npm:

```bash
openclaw plugins install @zytrux/daoyu
```

Install from a local archive:

```bash
openclaw plugins install ./zytrux-daoyu-0.1.16.tgz
```

### Upgrade

Repack and reinstall the plugin after code changes:

```bash
pnpm pack
openclaw plugins install ./zytrux-daoyu-0.1.16.tgz
```

Then restart the gateway:

```bash
openclaw gateway --port 18789 --verbose
```

### Compatibility

This plugin follows the OpenClaw SDK migration guidance and uses scoped plugin SDK subpath imports.

Requirements:

1. use a recent OpenClaw version that supports scoped plugin SDK imports
2. do not use deprecated `openclaw/plugin-sdk/compat`
3. reinstall the plugin package after upgrading plugin code

### Minimal Config

```json
{
  "channels": {
    "daoyu": {
      "enabled": true,
      "accounts": {
        "bota": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx",
            "appSecret": "sec_xxx"
          }
        }
      }
    }
  }
}
```

Default values:

1. `serverUrl = https://api.aidaoyu.cn`
2. `wsPath = /openclaw/ws`
3. `oauth.tokenPath = /openclaw/oauth/token`
4. `auth.requiredSignatures = true`
5. `auth.signatureDebug = false`

Runtime behavior:

1. `deviceId` may be written back to config for stable device identity
2. `accessToken` is cached in memory and is not written back to `openclaw.json`

### Multi-Account Example

```json
{
  "agents": {
    "list": [
      {
        "id": "daoyu-bota",
        "workspace": "/root/.openclaw/workspace/daoyu-bota",
        "agentDir": "/root/.openclaw/agents/daoyu-bota/agent"
      },
      {
        "id": "daoyu-botb",
        "workspace": "/root/.openclaw/workspace/daoyu-botb",
        "agentDir": "/root/.openclaw/agents/daoyu-botb/agent"
      }
    ]
  },
  "bindings": [
    {
      "agentId": "daoyu-bota",
      "match": {
        "channel": "daoyu",
        "accountId": "bota"
      }
    },
    {
      "agentId": "daoyu-botb",
      "match": {
        "channel": "daoyu",
        "accountId": "botb"
      }
    }
  ],
  "channels": {
    "daoyu": {
      "enabled": true,
      "defaultAccount": "bota",
      "accounts": {
        "bota": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx_a",
            "appSecret": "sec_xxx_a"
          }
        },
        "botb": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx_b",
            "appSecret": "sec_xxx_b"
          }
        }
      }
    }
  }
}
```

### Server Requirements

Your Daoyu server should provide:

1. `POST /openclaw/oauth/token`
2. `GET /openclaw/ws`
3. `Authorization: Bearer <accessToken>` for WebSocket handshake
4. frame signing compatible with the Daoyu plugin protocol

Recommended production behavior:

1. bind `requestId` to the original `uid + appId`
2. rate limit token requests and failed WS handshakes
3. keep token TTL short enough for rotation
4. avoid logging raw business payloads in production

### Security

Production deployment requirements:

1. use `https://` and `wss://` only
2. keep `requiredSignatures = true`
3. keep `signatureDebug = false`
4. do not commit `appSecret`, `accessToken`, or local `openclaw.json`
5. rotate bot secrets when credentials are exposed

### Notes

1. each account keeps its own runtime token cache, `deviceId`, and session context
2. session isolation key includes `accountId`
3. different accounts can stay online at the same time on one gateway

---

## 中文

Daoyu 是一款面向 AI 对话体验的 3D Chat 软件。

- 产品官网：[aidaoyu.cn](http://aidaoyu.cn/)
- 公司官网：[zytrux.com](http://zytrux.com/)

### 功能特性

1. 支持 `appId/appSecret` BOT 鉴权
2. 支持与 Daoyu 服务端保持持久 WebSocket 长连接
3. 支持消息帧签名
4. 支持多账户同时在线
5. 按 `accountId` 隔离上下文
6. `accessToken` 运行时缓存，`deviceId` 持久化

### 安装

从 npm 安装：

```bash
openclaw plugins install @zytrux/daoyu
```

从本地压缩包安装：

```bash
openclaw plugins install ./zytrux-daoyu-0.1.16.tgz
```

### 升级

代码更新后，重新打包并重新安装：

```bash
pnpm pack
openclaw plugins install ./zytrux-daoyu-0.1.16.tgz
```

然后重启网关：

```bash
openclaw gateway --port 18789 --verbose
```

### 兼容性

本插件已按 OpenClaw 官方 SDK migration 方案切换为 scoped plugin SDK subpath import。

要求：

1. 使用支持 scoped plugin SDK import 的较新版本 OpenClaw
2. 不再使用已废弃的 `openclaw/plugin-sdk/compat`
3. 插件升级后需要重新安装插件包

### 最小配置

```json
{
  "channels": {
    "daoyu": {
      "enabled": true,
      "accounts": {
        "bota": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx",
            "appSecret": "sec_xxx"
          }
        }
      }
    }
  }
}
```

默认值：

1. `serverUrl = https://api.aidaoyu.cn`
2. `wsPath = /openclaw/ws`
3. `oauth.tokenPath = /openclaw/oauth/token`
4. `auth.requiredSignatures = true`
5. `auth.signatureDebug = false`

运行时行为：

1. `deviceId` 可能会回写到配置，用于保持设备身份稳定
2. `accessToken` 仅在运行时内存缓存，不会回写到 `openclaw.json`

### 多账户配置示例

```json
{
  "agents": {
    "list": [
      {
        "id": "daoyu-bota",
        "workspace": "/root/.openclaw/workspace/daoyu-bota",
        "agentDir": "/root/.openclaw/agents/daoyu-bota/agent"
      },
      {
        "id": "daoyu-botb",
        "workspace": "/root/.openclaw/workspace/daoyu-botb",
        "agentDir": "/root/.openclaw/agents/daoyu-botb/agent"
      }
    ]
  },
  "bindings": [
    {
      "agentId": "daoyu-bota",
      "match": {
        "channel": "daoyu",
        "accountId": "bota"
      }
    },
    {
      "agentId": "daoyu-botb",
      "match": {
        "channel": "daoyu",
        "accountId": "botb"
      }
    }
  ],
  "channels": {
    "daoyu": {
      "enabled": true,
      "defaultAccount": "bota",
      "accounts": {
        "bota": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx_a",
            "appSecret": "sec_xxx_a"
          }
        },
        "botb": {
          "enabled": true,
          "auth": {
            "appId": "bot_xxx_b",
            "appSecret": "sec_xxx_b"
          }
        }
      }
    }
  }
}
```

### 服务端要求

Daoyu 服务端至少需要提供：

1. `POST /openclaw/oauth/token`
2. `GET /openclaw/ws`
3. WebSocket 握手时使用 `Authorization: Bearer <accessToken>`
4. 与插件一致的消息帧签名协议

正式环境建议：

1. 将 `requestId` 与原始 `uid + appId` 做强绑定
2. 对 token 获取和 WS 握手失败做限流
3. 缩短 token TTL，便于密钥轮换
4. 生产环境避免记录原始业务正文

### 安全要求

正式环境请遵循：

1. 只使用 `https://` 和 `wss://`
2. 保持 `requiredSignatures = true`
3. 保持 `signatureDebug = false`
4. 不要提交 `appSecret`、`accessToken`、本地 `openclaw.json`
5. 凭据泄露后及时轮换 BOT 密钥

### 说明

1. 每个账户都有自己的 token 缓存、`deviceId` 和会话上下文
2. 会话隔离键中包含 `accountId`
3. 不同账户可以同时连接到同一个 OpenClaw gateway
