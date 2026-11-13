/// Deployable PolkaVM program produced by the artifact build script.
pub static PROGRAM_BINARY: &[u8] = include_bytes!(concat!(
    env!("OUT_DIR"),
    "/",
    env!("RIALO_BUILD_ARTIFACT_FILE")
));
