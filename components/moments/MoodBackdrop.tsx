import {
  Canvas,
  Circle,
  LinearGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import { Dimensions, StyleSheet } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

type MoodBackdropProps = {
  primary: string;
  secondary: string;
};

export const MoodBackdrop = ({ primary, secondary }: MoodBackdropProps) => {
  return (
    <Canvas style={styles.moodBackdropCanvas}>
      <Rect x={0} y={0} width={SCREEN_WIDTH} height={240}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(SCREEN_WIDTH, 240)}
          colors={[`${primary}33`, `${secondary}1F`, "#ffffff00"]}
        />
      </Rect>
      <Circle cx={SCREEN_WIDTH * 0.2} cy={50} r={70} color={`${primary}24`} />
      <Circle
        cx={SCREEN_WIDTH * 0.8}
        cy={30}
        r={55}
        color={`${secondary}22`}
      />
      <Circle cx={SCREEN_WIDTH * 0.65} cy={160} r={90} color={`${primary}18`} />
      <Circle
        cx={SCREEN_WIDTH * 0.12}
        cy={170}
        r={40}
        color={`${secondary}1C`}
      />
      <Circle cx={SCREEN_WIDTH * 0.45} cy={90} r={6} color="#ffffff90" />
      <Circle cx={SCREEN_WIDTH * 0.35} cy={140} r={4} color="#ffffff80" />
      <Circle cx={SCREEN_WIDTH * 0.7} cy={120} r={5} color="#ffffff85" />
    </Canvas>
  );
};

const styles = StyleSheet.create({
  moodBackdropCanvas: {
    position: "absolute",
    top: -20,
    left: 0,
    width: SCREEN_WIDTH,
    height: 240,
  },
});
