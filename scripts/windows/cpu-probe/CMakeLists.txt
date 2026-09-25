cmake_minimum_required(VERSION 3.15)
project(reframe_cpu_probe LANGUAGES CXX)
set(CMAKE_MSVC_RUNTIME_LIBRARY MultiThreaded)
add_executable(whisper-cpu ../cpu-capabilities.cpp)
