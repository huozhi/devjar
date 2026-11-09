use std::path::Path;
use oxc_allocator::Allocator;
use oxc_codegen::Codegen;
use oxc_diagnostics::OxcDiagnostic;
use oxc_parser::{ParseOptions, Parser};
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{TransformOptions, Transformer};
use oxc_transformer_plugins::{ReplaceGlobalDefines, ReplaceGlobalDefinesConfig};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn transform(filename: &str, source: &str) -> Result<String, JsError> {
    let allocator = Allocator::default();
    let source_type = match Path::new(filename).extension().and_then(|ext| ext.to_str()) {
        Some("ts" | "tsx" | "mts" | "cts") => SourceType::tsx(),
        _ => SourceType::jsx(),
    };
    let parsed = Parser::new(&allocator, source, source_type)
        .with_options(ParseOptions { preserve_parens: false, ..ParseOptions::default() })
        .parse();
    if let Some(error) = parsed.diagnostics.errors().next() {
        return Err(format_error(filename, source, error));
    }
    let mut program = parsed.program;
    let semantic = SemanticBuilder::new_compiler()
        .with_excess_capacity(2.0)
        .with_enum_eval(true)
        .build(&program);
    if let Some(error) = semantic.diagnostics.errors().next() {
        return Err(format_error(filename, source, error));
    }
    // Matches `TransformOptions::from_target("es2022")` without linking Oxc's
    // compatibility table: only post-ES2022 syntax is lowered.
    let mut options = TransformOptions::default();
    options.env.es2026.explicit_resource_management = true;
    options.env.regexp.set_notation = true;
    options.jsx.development = true;
    options.jsx.refresh = Some(Default::default());
    options.jsx.conform();
    options.decorator.legacy = true;
    let result = Transformer::new(&allocator, Path::new(filename), &options)
        .build_with_scoping(semantic.semantic.into_scoping(), &mut program);
    if let Some(error) = result.diagnostics.errors().next() {
        return Err(format_error(filename, source, error));
    }
    let defines = ReplaceGlobalDefinesConfig::new(&[("process.env.NODE_ENV", "\"development\"")])
        .map_err(|_| JsError::new("Invalid compiler defines"))?;
    // Transformer output can contain cloned nodes without semantic ids, such as the
    // hook lists React Refresh repeats around `memo(fn)`. Defines read those ids.
    let scoping = SemanticBuilder::new().build(&program).semantic.into_scoping();
    let _ = ReplaceGlobalDefines::new(&allocator, defines).build(scoping, &mut program);
    Ok(Codegen::new().build(&program).code)
}

/// Formats a diagnostic as a one-line code frame. Oxc's graphical renderer links
/// Unicode width, segmentation, and line-breaking tables into the WASM binary.
fn format_error(filename: &str, source: &str, error: &OxcDiagnostic) -> JsError {
    let mut message = error.message.to_string();
    if let Some(label) = error.labels.first() {
        let start = (label.offset() as usize).min(source.len());
        let line_start = source[..start].rfind('\n').map_or(0, |index| index + 1);
        let line_end = source[start..].find('\n').map_or(source.len(), |index| start + index);
        let line = source[line_start..line_end].trim_end_matches('\r');
        let line_number = source[..line_start].matches('\n').count() + 1;
        let column = source[line_start..start].chars().count() + 1;
        let end = (start + label.len() as usize).min(line_start + line.len()).max(start);
        let underline = "^".repeat(source[start..end].chars().count().max(1));
        // Keep tabs so the marker lines up with the source line.
        let indent: String = source[line_start..start]
            .chars()
            .map(|ch| if ch == '\t' { '\t' } else { ' ' })
            .collect();
        let gutter = line_number.to_string();
        let padding = " ".repeat(gutter.len());
        message.push_str(&format!(
            "\n{padding}--> {filename}:{line_number}:{column}\n{padding} |\n{gutter} | {line}\n{padding} | {indent}{underline}"
        ));
        if let Some(text) = label.label() {
            message.push(' ');
            message.push_str(text);
        }
    }
    if let Some(help) = &error.help {
        message.push_str("\nhelp: ");
        message.push_str(help);
    }
    JsError::new(&message)
}
