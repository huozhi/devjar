use std::path::Path;
use oxc_allocator::Allocator;
use oxc_codegen::Codegen;
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
        return Err(JsError::new(&error.clone().render_with_source_code(source.to_owned())));
    }
    let mut program = parsed.program;
    let semantic = SemanticBuilder::new_compiler()
        .with_excess_capacity(2.0)
        .with_enum_eval(true)
        .build(&program);
    if let Some(error) = semantic.diagnostics.errors().next() {
        return Err(JsError::new(&error.clone().render_with_source_code(source.to_owned())));
    }
    let mut options = TransformOptions::from_target("es2022")
        .map_err(|error| JsError::new(&error))?;
    options.jsx.development = true;
    options.jsx.refresh = Some(Default::default());
    options.jsx.conform();
    options.decorator.legacy = true;
    let result = Transformer::new(&allocator, Path::new(filename), &options)
        .build_with_scoping(semantic.semantic.into_scoping(), &mut program);
    if let Some(error) = result.diagnostics.errors().next() {
        return Err(JsError::new(&error.clone().render_with_source_code(source.to_owned())));
    }
    let defines = ReplaceGlobalDefinesConfig::new(&[("process.env.NODE_ENV", "\"development\"")])
        .map_err(|_| JsError::new("Invalid compiler defines"))?;
    let _ = ReplaceGlobalDefines::new(&allocator, defines).build(result.scoping, &mut program);
    Ok(Codegen::new().build(&program).code)
}
