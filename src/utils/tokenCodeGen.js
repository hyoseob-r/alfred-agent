/**
 * YDS 2.0 Token → SwiftUI / Jetpack Compose 코드 생성기
 *
 * tokens.js의 디자인 토큰을 읽어서 각 플랫폼 네이티브 코드로 변환
 */

// ── SwiftUI 생성 ─────────────────────────────────────────────────────────────

export function generateSwiftUI(tokens) {
  const lines = [];
  lines.push('import SwiftUI');
  lines.push('');
  lines.push('// ═══════════════════════════════════════════════════════════════');
  lines.push('// YDS 2.0 Design Tokens — Auto-generated from Figma');
  lines.push('// ═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Colors
  lines.push('// MARK: - Colors');
  lines.push('extension Color {');
  lines.push('    enum YDS {');

  if (tokens.colors?.foundation) {
    lines.push('        // Foundation');
    for (const [key, val] of Object.entries(tokens.colors.foundation)) {
      if (val?.value) {
        lines.push(`        static let ${camelCase(key)} = Color(hex: "${val.value}")`);
      }
    }
  }
  if (tokens.colors?.gray) {
    lines.push('        // Gray');
    for (const [key, val] of Object.entries(tokens.colors.gray)) {
      if (val?.value) {
        lines.push(`        static let ${camelCase(key)} = Color(hex: "${val.value}")`);
      }
    }
  }
  if (tokens.colors?.background) {
    lines.push('        // Background');
    for (const [key, val] of Object.entries(tokens.colors.background)) {
      if (val?.value) {
        lines.push(`        static let ${camelCase('bg_' + key)} = Color(hex: "${val.value}")`);
      }
    }
  }
  if (tokens.colors?.light) {
    lines.push('        // Light Palette');
    for (const [key, val] of Object.entries(tokens.colors.light)) {
      if (val?.value) {
        lines.push(`        static let ${camelCase(key)} = Color(hex: "${val.value}")`);
      }
    }
  }
  lines.push('    }');
  lines.push('}');
  lines.push('');

  // Color hex extension
  lines.push('extension Color {');
  lines.push('    init(hex: String) {');
  lines.push('        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)');
  lines.push('        var int: UInt64 = 0');
  lines.push('        Scanner(string: hex).scanHexInt64(&int)');
  lines.push('        let a, r, g, b: UInt64');
  lines.push('        switch hex.count {');
  lines.push('        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)');
  lines.push('        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)');
  lines.push('        default: (a, r, g, b) = (255, 0, 0, 0)');
  lines.push('        }');
  lines.push('        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  // Typography
  lines.push('// MARK: - Typography');
  lines.push('extension Font {');
  lines.push('    enum YDS {');
  if (tokens.typography) {
    for (const t of tokens.typography) {
      const name = t.name.replace(/\//g, '_').replace(/\s/g, '');
      const weight = t.weight >= 700 ? '.bold' : '.regular';
      lines.push(`        static let ${camelCase(name)} = Font.system(size: ${t.size}, weight: ${weight})`);
    }
  }
  lines.push('    }');
  lines.push('}');
  lines.push('');

  // Spacing
  lines.push('// MARK: - Spacing');
  lines.push('enum YDSSpacing {');
  if (tokens.spacing) {
    for (const s of tokens.spacing) {
      lines.push(`    static let ${s.name}: CGFloat = ${s.value}`);
    }
  }
  lines.push('}');
  lines.push('');

  // Radius
  lines.push('// MARK: - Radius');
  lines.push('enum YDSRadius {');
  if (tokens.metaTokens?.radius) {
    for (const [key, val] of Object.entries(tokens.metaTokens.radius)) {
      lines.push(`    static let ${camelCase(key)}: CGFloat = ${val}`);
    }
  }
  lines.push('}');

  return lines.join('\n');
}

// ── Jetpack Compose 생성 ─────────────────────────────────────────────────────

export function generateCompose(tokens) {
  const lines = [];
  lines.push('package com.yogiyo.yds.tokens');
  lines.push('');
  lines.push('import androidx.compose.ui.graphics.Color');
  lines.push('import androidx.compose.ui.text.TextStyle');
  lines.push('import androidx.compose.ui.text.font.FontWeight');
  lines.push('import androidx.compose.ui.unit.dp');
  lines.push('import androidx.compose.ui.unit.sp');
  lines.push('');
  lines.push('// ═══════════════════════════════════════════════════════════════');
  lines.push('// YDS 2.0 Design Tokens — Auto-generated from Figma');
  lines.push('// ═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Colors
  lines.push('object YDSColors {');
  lines.push('    // Foundation');
  if (tokens.colors?.foundation) {
    for (const [key, val] of Object.entries(tokens.colors.foundation)) {
      if (val?.value) {
        lines.push(`    val ${camelCase(key)} = Color(0xFF${hexToARGB(val.value)})`);
      }
    }
  }
  lines.push('');
  lines.push('    // Gray');
  if (tokens.colors?.gray) {
    for (const [key, val] of Object.entries(tokens.colors.gray)) {
      if (val?.value) {
        lines.push(`    val ${camelCase(key)} = Color(0xFF${hexToARGB(val.value)})`);
      }
    }
  }
  lines.push('');
  lines.push('    // Background');
  if (tokens.colors?.background) {
    for (const [key, val] of Object.entries(tokens.colors.background)) {
      if (val?.value) {
        lines.push(`    val ${camelCase('bg_' + key)} = Color(0x${hexToARGB(val.value)})`);
      }
    }
  }
  lines.push('');
  lines.push('    // Light Palette');
  if (tokens.colors?.light) {
    for (const [key, val] of Object.entries(tokens.colors.light)) {
      if (val?.value) {
        lines.push(`    val ${camelCase(key)} = Color(0xFF${hexToARGB(val.value)})`);
      }
    }
  }
  lines.push('}');
  lines.push('');

  // Typography
  lines.push('object YDSTypography {');
  if (tokens.typography) {
    for (const t of tokens.typography) {
      const name = t.name.replace(/\//g, '_').replace(/\s/g, '');
      const weight = t.weight >= 700 ? 'FontWeight.Bold' : 'FontWeight.Normal';
      lines.push(`    val ${camelCase(name)} = TextStyle(fontSize = ${t.size}.sp, fontWeight = ${weight}, lineHeight = ${t.lineHeight}.sp)`);
    }
  }
  lines.push('}');
  lines.push('');

  // Spacing
  lines.push('object YDSSpacing {');
  if (tokens.spacing) {
    for (const s of tokens.spacing) {
      lines.push(`    val ${s.name} = ${s.value}.dp`);
    }
  }
  lines.push('}');
  lines.push('');

  // Radius
  lines.push('object YDSRadius {');
  if (tokens.metaTokens?.radius) {
    for (const [key, val] of Object.entries(tokens.metaTokens.radius)) {
      lines.push(`    val ${camelCase(key)} = ${val}.dp`);
    }
  }
  lines.push('}');

  return lines.join('\n');
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function camelCase(str) {
  return str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).replace(/^(\w)/, (_, c) => c.toLowerCase());
}

function hexToARGB(hex) {
  const clean = hex.replace('#', '');
  if (clean.length === 8) return clean.toUpperCase(); // already has alpha
  if (clean.length === 6) return clean.toUpperCase();
  return '000000';
}
