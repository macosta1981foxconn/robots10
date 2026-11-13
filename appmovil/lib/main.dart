import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  runApp(const VelocimetroApp());
}

class VelocimetroApp extends StatelessWidget {
  const VelocimetroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Velocímetro',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blueGrey),
      ),
      home: const SpeedometerPage(),
    );
  }
}

class SpeedometerPage extends StatefulWidget {
  const SpeedometerPage({super.key});

  @override
  State<SpeedometerPage> createState() => _SpeedometerPageState();
}

class _SpeedometerPageState extends State<SpeedometerPage> {
  StreamSubscription<Position>? _positionSub;
  double _speedKmh = 0;
  double _maxSpeedKmh = 0;
  double? _accuracy;
  bool _tracking = false;
  String _message = 'Presiona iniciar para medir la velocidad';

  Future<void> _toggleTracking() async {
    if (_tracking) {
      _stopTracking();
    } else {
      await _startTracking();
    }
  }

  Future<void> _startTracking() async {
    setState(() => _message = 'Verificando GPS...');
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() => _message = 'Activa el GPS del dispositivo');
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() => _message = 'Permiso de ubicación denegado');
        return;
      }

      _positionSub = Geolocator.getPositionStream(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.bestForNavigation,
          distanceFilter: 0,
          intervalDuration: const Duration(seconds: 1),
        ),
      ).listen(
        (position) {
          final speed = position.speed < 0 ? 0 : position.speed;
          final kmh = speed * 3.6;
          setState(() {
            _speedKmh = kmh;
            if (kmh > _maxSpeedKmh) _maxSpeedKmh = kmh;
            _accuracy = position.accuracy;
            _message = '';
          });
        },
        onError: (error) {
          setState(() => _message = 'Error GPS: $error');
        },
      );

      setState(() => _tracking = true);
    } catch (error) {
      setState(() => _message = 'Error: $error');
    }
  }

  void _stopTracking() {
    _positionSub?.cancel();
    _positionSub = null;
    setState(() {
      _tracking = false;
      _speedKmh = 0;
      _message = 'Detenido';
    });
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Velocímetro')),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.speed, size: 48, color: Colors.blueGrey),
                    const SizedBox(width: 8),
                    Text('Velocímetro GPS', style: Theme.of(context).textTheme.headlineMedium),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  _speedKmh.toStringAsFixed(0),
                  style: TextStyle(
                    fontSize: 96,
                    fontWeight: FontWeight.bold,
                    color: _tracking ? Colors.blueAccent : Colors.grey,
                  ),
                ),
                const Text('km/h', style: TextStyle(fontSize: 24, color: Colors.grey)),
                const SizedBox(height: 16),
                Text('Máx: ${_maxSpeedKmh.toStringAsFixed(0)} km/h'),
                if (_accuracy != null)
                  Text('Precisión: ±${_accuracy!.toStringAsFixed(0)} m'),
                const SizedBox(height: 24),
                Text(
                  _message,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade700),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _toggleTracking,
                  icon: Icon(_tracking ? Icons.stop : Icons.play_arrow),
                  label: Text(_tracking ? 'Detener' : 'Iniciar'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                    textStyle: const TextStyle(fontSize: 18),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
