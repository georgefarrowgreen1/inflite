import MapKit
import SwiftUI

struct WeatherRadarMap: UIViewRepresentable {
    let place: WeatherPlace
    let tileTemplate: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.pointOfInterestFilter = .excludingAll
        map.setCameraZoomRange(MKMapView.CameraZoomRange(minCenterCoordinateDistance: 250_000), animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let coordinator = context.coordinator
        if coordinator.place != place {
            coordinator.place = place
            let center = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lon)
            map.setRegion(MKCoordinateRegion(center: center, latitudinalMeters: 370_000, longitudinalMeters: 370_000),
                          animated: false)
        }
        guard coordinator.tileTemplate != tileTemplate else { return }
        if let oldOverlay = coordinator.overlay { map.removeOverlay(oldOverlay) }
        let overlay = MKTileOverlay(urlTemplate: tileTemplate)
        overlay.tileSize = CGSize(width: 256, height: 256)
        overlay.maximumZ = 7
        overlay.canReplaceMapContent = false
        coordinator.tileTemplate = tileTemplate
        coordinator.overlay = overlay
        map.addOverlay(overlay, level: .aboveRoads)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var place: WeatherPlace?
        var tileTemplate: String?
        var overlay: MKTileOverlay?

        func mapView(_ mapView: MKMapView, rendererFor overlay: any MKOverlay) -> MKOverlayRenderer {
            guard let tiles = overlay as? MKTileOverlay else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKTileOverlayRenderer(tileOverlay: tiles)
            renderer.alpha = 0.72
            return renderer
        }
    }
}
