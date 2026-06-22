import dts from 'rollup-plugin-dts';

export default {
  input: './dist/types/node/src/index.d.ts',
  output: {
    file: './dist/types.d.ts',
    format: 'es',
  },
  plugins: [dts()],
};
