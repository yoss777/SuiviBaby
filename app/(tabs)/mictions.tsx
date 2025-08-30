import { StyleSheet, Text, View } from 'react-native';

export default function MictionsScreen() {
  return (
    <View style={styles.container}>
      <Text>Tab Mictions</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
