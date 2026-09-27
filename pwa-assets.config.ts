import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

const darkBackground = { background: '#0A0B0D', fit: 'contain' as const }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: combinePresetAndAppleSplashScreens(
    {
      ...minimal2023Preset,
      // The defaults pad maskable and Apple icons on white; the app is dark.
      maskable: { ...minimal2023Preset.maskable, resizeOptions: darkBackground },
      apple: { ...minimal2023Preset.apple, resizeOptions: darkBackground },
    },
    {
      padding: 0.55,
      resizeOptions: darkBackground,
      linkMediaOptions: { log: false, addMediaScreen: true, basePath: './' },
      // The default name adds "light-" when head links are generated but not
      // when files are written, so the links would point at missing files.
      name: (landscape, size, dark) =>
        `apple-splash-${landscape ? 'landscape' : 'portrait'}${dark ? '-dark' : ''}-${size.width}x${size.height}.png`,
    },
    [
      'iPhone 17 Pro Max',
      'iPhone 17 Pro',
      'iPhone Air',
      'iPhone 17',
      'iPhone 16 Pro Max',
      'iPhone 16 Pro',
      'iPhone 16 Plus',
      'iPhone 16',
      'iPhone 16e',
      'iPhone 15 Pro Max',
      'iPhone 15 Pro',
      'iPhone 14',
      'iPhone 13 mini',
      'iPhone SE 4.7"',
    ],
  ),
  images: ['public/icon.svg'],
})
