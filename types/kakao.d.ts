// Minimal type definitions for Kakao Maps JavaScript SDK
// Only covers the surface we actually use.

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    // Internal projection coordinate (WCONG by default).
    // Polygon.getPath() returns Coords[], not LatLng[].
    // Use coord.toLatLng() to convert to WGS84.
    class Coords {
      getX(): number;
      getY(): number;
      toLatLng(): LatLng;
    }

    class LatLngBounds {
      constructor();
      extend(latlng: LatLng): void;
    }

    interface MapOptions {
      center: LatLng;
      level?: number;
      mapTypeId?: MapTypeIdValue;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
      getLevel(): number;
      setMapTypeId(mapTypeId: MapTypeIdValue): void;
      getCenter(): LatLng;
    }

    type MapTypeIdValue = number;
    const MapTypeId: {
      ROADMAP: MapTypeIdValue;
      SKYVIEW: MapTypeIdValue;
      HYBRID: MapTypeIdValue;
    };

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      draggable?: boolean;
      title?: string;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
      getPosition(): LatLng;
      setDraggable(draggable: boolean): void;
    }

    interface CustomOverlayOptions {
      position: LatLng;
      content: string | HTMLElement;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
      map?: Map;
      clickable?: boolean;
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
    }

    interface PolygonOptions {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
    }

    class Polygon {
      constructor(options: PolygonOptions);
      setMap(map: Map | null): void;
      setPath(path: LatLng[]): void;
      // Returns an array of Coords (internal projection), NOT LatLng.
      // Convert each with toLatLng() to get WGS84.
      getPath(): Coords[];
    }

    namespace event {
      function addListener(
        target: Map | Marker | Polygon | CustomOverlay,
        type: string,
        handler: (event?: { latLng?: LatLng }) => void,
      ): void;
      function removeListener(
        target: Map | Marker | Polygon | CustomOverlay,
        type: string,
        handler: (event?: { latLng?: LatLng }) => void,
      ): void;
    }

    namespace drawing {
      type OverlayTypeValue = string;
      const OverlayType: {
        MARKER: OverlayTypeValue;
        POLYLINE: OverlayTypeValue;
        RECTANGLE: OverlayTypeValue;
        CIRCLE: OverlayTypeValue;
        POLYGON: OverlayTypeValue;
        ARROW: OverlayTypeValue;
      };

      interface DrawingManagerOptions {
        map: Map;
        drawingMode?: OverlayTypeValue[];
        guideTooltip?: ('draw' | 'drag' | 'edit')[];
        polygonOptions?: {
          draggable?: boolean;
          removable?: boolean;
          editable?: boolean;
          strokeColor?: string;
          fillColor?: string;
          fillOpacity?: number;
          hintStrokeStyle?: string;
          hintStrokeOpacity?: number;
        };
      }

      interface DrawendEvent {
        overlayType: OverlayTypeValue;
        data: {
          points?: { x: number; y: number }[];
        };
        // target is the drawn overlay instance (e.g. Polygon for polygon mode).
        // Polygon.getPath() returns Coords[] (internal projection), not LatLng[].
        target: { getPath?: () => Coords[] };
      }

      class DrawingManager {
        constructor(options: DrawingManagerOptions);
        select(overlayType: OverlayTypeValue): void;
        cancel(): void;
        getOverlays(): unknown;
        addListener(eventName: 'drawend', handler: (event: DrawendEvent) => void): void;
      }
    }

    namespace services {
      type Status = 'OK' | 'ZERO_RESULT' | 'ERROR';

      interface PlacesSearchResultItem {
        id?: string;
        place_name: string;
        address_name: string;
        road_address_name?: string;
        x: string;
        y: string;
        category_group_name?: string;
      }

      interface AddressSearchResultItem {
        address_name: string;
        address?: { address_name: string };
        road_address?: { address_name: string; building_name?: string };
        x: string;
        y: string;
      }

      interface SearchOptions {
        size?: number;
        page?: number;
      }

      class Places {
        constructor();
        keywordSearch(
          keyword: string,
          callback: (result: PlacesSearchResultItem[], status: Status) => void,
          options?: SearchOptions,
        ): void;
      }

      class Geocoder {
        constructor();
        addressSearch(
          address: string,
          callback: (result: AddressSearchResultItem[], status: Status) => void,
        ): void;
      }
    }
  }
}

export {};
