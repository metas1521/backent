{ pkgs }:
{
  deps = [
    pkgs.nodejs_20
    pkgs.bash
    pkgs.curl
  ];
  env = {
    NODE_ENV = "development";
    PORT = "5000";
  };
}
