// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "InFliteMac",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "InFlite", targets: ["InFlite"])],
    targets: [
        .target(name: "InFliteCore"),
        .executableTarget(name: "InFlite", dependencies: ["InFliteCore"]),
        .testTarget(name: "InFliteCoreTests", dependencies: ["InFliteCore"])
    ]
)
