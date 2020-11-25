import typescript from '@rollup/plugin-typescript';

const config = {
  input: 'serverless.ts',
  output: {
    format: 'commonjs',
    file: 'serverless.bundle.js',
  },
  watch: {
    clearScreen: false
  },
  plugins: [
    typescript({
      module: "es2015"
    }),
  ]
};

export default config;
