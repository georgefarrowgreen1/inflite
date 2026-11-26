// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "InFliteCrypto",
    products: [
        .library(name: "InFliteArgon2", targets: ["InFliteArgon2"])
    ],
    targets: [
        .target(
            name: "InFliteArgon2",
            cSettings: [.define("ARGON2_NO_THREADS")]
        )
    ]
)
