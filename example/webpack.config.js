const path = require("path");
module.exports = {
  devServer: {
    contentBase: __dirname
  },
  entry: path.join(__dirname, "index.js"),
  output: {
    filename: "build.js",
    path: __dirname
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["env"]
          }
        }
      }
    ]
  }
};
