

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // const [hasHydrated, setHasHydrated] = useState(false);

  // useEffect(() => {
  //   setHasHydrated(true);
  // }, []);

  // const colorScheme = useRNColorScheme();
  // const context = useContext(ThemeContext);

  // if (hasHydrated) {
  //   if (!context) {
  //     return colorScheme;
  //   }
  //   return context.resolvedColorScheme;
  // }

  return "light";
}
