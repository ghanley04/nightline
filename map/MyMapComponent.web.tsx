// import React, { useEffect, useRef, useState } from 'react';
// import { View, StyleSheet } from 'react-native';

// import MapView from '@teovilla/react-native-web-maps';

// import { MapContainer, TileLayer, useMap } from 'react-leaflet'


// const MyMapComponent = () => {

//     console.log("MapView:", MapView);


//     const MapViewAny = MapView as any;

//             console.log("MapViewAny:", MapViewAny);


//     const [region, setRegion] = useState({
//         latitude: 38.94655585,
//         longitude: -92.32853115,
//         latitudeDelta: 0.0104661,
//         longitudeDelta: 0.0108553,
//     });
//     // Define the coordinates for the bus route as an array of objects.
//     // Each object represents a point on the route.
//     const busRouteCoordinates = [
//         { latitude: 38.9450, longitude: -92.3283 }, // Jesse Hall
//         { latitude: 38.9442, longitude: -92.3268 }, // Memorial Union
//         { latitude: 38.9400, longitude: -92.3240 }, // Peace Park
//         { latitude: 38.9385, longitude: -92.3265 }, // Rec Center
//     ];

// if (!region) return <View style={styles.container} />;
// console.log(MapViewAny.Marker)
// console.log(MapViewAny.Polyline)

//     return (
        
//         <View
//             style={styles.container}
//         >
//             <MapViewAny
//                 style={styles.map}
//                 provider='google'
//                 // region={region}
//                 // region={{
//                 //     latitude: 38.945,       // center near Jesse Hall
//                 //     longitude: -92.326,     // central longitude
//                 //     latitudeDelta: 0.01,    // zooms in close to campus
//                 //     longitudeDelta: 0.01,
//                 // }}
//                 zoom={16}
//                 initialRegion={region}

//             >
//                 <MapViewAny.Marker
//                     coordinate={busRouteCoordinates[0]}
//                     title={"Jesse Hall"}
//                     description={"Bus Stop A"}
//                 />

//                 {/* Marker for Memorial Union, a stop on the route. */}
//                 <MapViewAny.Marker
//                     coordinate={busRouteCoordinates[1]}
//                     title={"Memorial Union"}
//                     description={"Bus Stop B"}
//                 />

//                 {/* Marker for Peace Park, another stop on the route. */}
//                 <MapViewAny.Marker
//                     coordinate={busRouteCoordinates[2]}
//                     title={"Peace Park"}
//                     description={"Bus Stop C"}
//                 />

//                 {/* Marker for the Rec Center, the final stop on the route. */}
//                 <MapViewAny.Marker
//                     coordinate={busRouteCoordinates[3]}
//                     title={"Rec Center"}
//                     description={"Bus Stop D"}
//                 />

//                 {/* Polyline to draw the bus route. The coordinates array
//                 determines the path. We'll use a blue color for the line. */}
//                 <MapViewAny.Polyline
//                     coordinates={busRouteCoordinates}
//                     strokeColor="#0000ff" // Blue color for the bus route
//                     strokeWidth={5} // A little thicker to stand out
//                 />
//             </MapViewAny>
//         </View>
//     );
// };

// const styles = StyleSheet.create({
//     container: {
//         flex: 1,
//     },
//     map: {
//         width: '100%',
//         height: '100%',
//     },
// });


// export default MyMapComponent;






