---
id: sys_theme_layout
title: App Layouts, Theme & Navigation System
type: architecture_system
connected_screens:
  - "[[Screen_Auth_and_Onboarding]]"
  - "[[Screen_Admin_Dashboard]]"
  - "[[Screen_Student_Home_and_Profile]]"
tags:
  - ui_ux
  - whatsapp_style
  - pure_clean
  - zero_latency
---

# 🎨 WhatsApp "Pure Clean" Design System & Zero-Latency Navigation

MockS adheres strictly to the **WhatsApp Pure Clean UI System**, stripping away heavy colored borders, multi-color gradient clutter, and blurry shadows for an ultra-fast, legible experience.

---

## 🎨 Visual Design System (WhatsApp Pure Clean)

| Element | Specification | Rationale |
| :--- | :--- | :--- |
| **Main App Background** | `#FFFFFF` (Pure Flat White) | Identical to WhatsApp; feels light, spacious, and distraction-free. |
| **Section Low Surface** | `#F8F9FA` | Subtle off-white for grouping cards and list containers. |
| **Input Fields** | `#F0F2F5` | Clean WhatsApp search bar & message input style. |
| **Primary Headers** | `#111827` (Dark Charcoal) | High-contrast, effortless readability for long study/test sessions. |
| **Secondary Text** | `#4B5563` (Muted Slate) | Clear subtitles and metadata. |
| **Dividers & Borders** | `#E5E7EB` (Subtle 1px) | Replaces thick borders with crisp 1px hairline dividers. |
| **Brand Accent** | `#AF2800` | Replaces WhatsApp green with MockS brand identity. |
| **Elevations & Shadows** | Flat / Elevation 0–1 | Eliminates heavy GPU layout redraws. |

---

## ⚡ Zero-Latency Tab Performance

* **`lazy: false` Pre-Warming**: Both Student and Admin tabs (`app/(student)/_layout.tsx`, `app/(admin)/_layout.tsx`) keep screens pre-warmed in memory.
* **Instant Switching**: Switching between tabs happens at **0ms delay (60–120 FPS native frame)** with zero spinners or white flashes.
